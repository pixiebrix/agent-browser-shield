#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "browserbase>=1.7.0",
#     "stagehand>=0.5.0",
#     "python-dotenv>=1.0.0",
# ]
# ///
"""Run a Browserbase + Stagehand agent task, optionally with the agent-browser-shield
extension loaded.

Setup:
  1. Build and package the extension:
       cd extension && bun run build && bun run package
  2. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in .env at the repo
     root (or in the environment). MODEL_API_KEY is optional: when omitted,
     the agent's LLM calls are routed via Browserbase Model Gateway.

Usage:
  uv run scripts/agent_task.py --with-extension \\
      --instruction "Find the top story and summarize the discussion"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import Stagehand

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _stagehand import (
    LOG,
    configure_logging,
    format_event,
    optional_env,
    require_env,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXTENSION_ZIP = REPO_ROOT / "output" / "extension.zip"
DEFAULT_SKILL = REPO_ROOT / "skills" / "agent-browser-shield" / "SKILL.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--with-extension",
        action="store_true",
        help="Upload extension/extension.zip and load it into the session.",
    )
    parser.add_argument(
        "--extension-zip",
        type=Path,
        default=DEFAULT_EXTENSION_ZIP,
        help=f"Path to the packaged extension zip (default: {DEFAULT_EXTENSION_ZIP.relative_to(REPO_ROOT)}).",
    )
    parser.add_argument(
        "--instruction",
        default="Find the top story on Hacker News and summarize the top comment.",
        help="Natural-language task for the agent.",
    )
    parser.add_argument(
        "--skill",
        type=Path,
        action="append",
        metavar="PATH",
        help=(
            "Prepend a skill file's body (frontmatter stripped) to the "
            "instruction. Repeatable. When --with-extension is set and no "
            "--skill is given, the agent-browser-shield skill is loaded by default — "
            "pass --no-default-skill to suppress."
        ),
    )
    parser.add_argument(
        "--no-default-skill",
        action="store_true",
        help=("Do not auto-load the agent-browser-shield skill when --with-extension is set."),
    )
    parser.add_argument(
        "--start-url",
        default="https://news.ycombinator.com",
        help="URL to navigate to before handing control to the agent.",
    )
    parser.add_argument("--max-steps", type=int, default=15)
    parser.add_argument("--model", default="openai/gpt-5-mini")
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity. -v for INFO, -vv for DEBUG on SDK loggers.",
    )
    return parser.parse_args()


def load_skill(path: Path) -> str:
    """Read a skill markdown file, stripping optional YAML frontmatter.

    Skill files follow the Anthropic Skills convention: a `---` fenced
    metadata block at the top (name, description, etc.) followed by the
    body. The agent only needs the body — frontmatter would just consume
    tokens.
    """
    text = path.read_text(encoding="utf-8")
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            text = text[end + len("\n---\n") :]
    return text.strip()


def compose_instruction(instruction: str, skill_paths: list[Path]) -> str:
    if not skill_paths:
        return instruction
    bodies = [load_skill(path) for path in skill_paths]
    return "\n\n".join([*bodies, instruction])


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    args = parse_args()
    configure_logging(args.verbose)

    bb_api_key = require_env("BROWSERBASE_API_KEY")
    bb_project_id = require_env("BROWSERBASE_PROJECT_ID")
    model_api_key = optional_env("MODEL_API_KEY")
    if model_api_key is None:
        LOG.info("MODEL_API_KEY not set; routing agent via Browserbase Model Gateway")

    skill_paths: list[Path] = list(args.skill or [])
    if args.with_extension and not args.skill and not args.no_default_skill:
        if DEFAULT_SKILL.is_file():
            skill_paths.append(DEFAULT_SKILL)
        else:
            LOG.warning(
                "Default skill not found at %s; agent will not be briefed on "
                "agent-browser-shield's DOM modifications.",
                DEFAULT_SKILL.relative_to(REPO_ROOT),
            )
    for path in skill_paths:
        if not path.is_file():
            sys.exit(f"Skill file not found: {path}")
        LOG.info("Loading skill: %s", path)
    instruction = compose_instruction(args.instruction, skill_paths)

    bb_create_params: dict[str, object] = {}
    if args.with_extension:
        if not args.extension_zip.is_file():
            sys.exit(
                f"Extension zip not found at {args.extension_zip}.\n"
                "Run `cd extension && bun run build && bun run package` first.",
            )
        # Upload via the raw Browserbase SDK to mint an extension_id, then let
        # Stagehand create the session that attaches it. Stagehand has to own
        # the session itself or its server-side context has no active page and
        # agentExecute fails with a null setActivePage error.
        bb = Browserbase(api_key=bb_api_key)
        with args.extension_zip.open("rb") as fh:
            extension = bb.extensions.create(file=fh)
        LOG.info("Uploaded extension %s (%s)", extension.id, args.extension_zip.name)
        bb_create_params["extension_id"] = extension.id

    stagehand_kwargs: dict[str, object] = {
        "browserbase_api_key": bb_api_key,
        "browserbase_project_id": bb_project_id,
        "timeout": 600.0,
    }
    if model_api_key is not None:
        stagehand_kwargs["model_api_key"] = model_api_key
    stagehand = Stagehand(**stagehand_kwargs)

    session = stagehand.sessions.start(
        model_name=args.model,
        browserbase_session_create_params=bb_create_params or None,
    )
    LOG.info("Created Stagehand session: %s", session.id)
    LOG.info("Live view: https://www.browserbase.com/sessions/%s", session.id)

    try:
        stagehand.sessions.navigate(id=session.id, url=args.start_url)
        LOG.info("Navigated to %s", args.start_url)

        LOG.info("Running agent: %r", args.instruction)
        if skill_paths:
            LOG.debug("Composed instruction (%d chars):\n%s", len(instruction), instruction)
        for index, event in enumerate(
            stagehand.sessions.execute(
                id=session.id,
                agent_config={"model": args.model},
                execute_options={
                    "instruction": instruction,
                    "maxSteps": args.max_steps,
                },
            )
        ):
            event_type = getattr(event, "type", None) or (
                event.get("type") if isinstance(event, dict) else None
            )
            LOG.info("event[%d] type=%s", index, event_type or "?")
            LOG.debug("event[%d] payload:\n%s", index, format_event(event))
    finally:
        try:
            stagehand.sessions.end(id=session.id)
        except Exception as exc:
            LOG.warning("failed to end session: %s", exc)
        LOG.info("Session replay: https://www.browserbase.com/sessions/%s", session.id)

    return 0


if __name__ == "__main__":
    sys.exit(main())
