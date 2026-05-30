import { htmlCommentStripRule } from "../html-comment-strip";
import { FIXTURES } from "./injection-fixtures";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  htmlCommentStripRule.teardown?.();
});

function commentNodesIn(root: Node): Comment[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const out: Comment[] = [];
  let current = walker.nextNode();
  while (current) {
    out.push(current as Comment);
    current = walker.nextNode();
  }
  return out;
}

describe("htmlCommentStripRule", () => {
  it("removes top-level HTML comments", () => {
    document.body.innerHTML = `${FIXTURES.HTML_COMMENT_IGNORE}<p>hello</p>`;
    htmlCommentStripRule.apply(document.body);

    expect(commentNodesIn(document.body)).toHaveLength(0);
    expect(document.body.textContent).toContain("hello");
  });

  it("removes nested comments", () => {
    document.body.innerHTML = `
      <article>
        <p>visible${FIXTURES.HTML_COMMENT_NESTED}</p>
        <div><!-- another --></div>
      </article>
    `;
    htmlCommentStripRule.apply(document.body);

    expect(commentNodesIn(document.body)).toHaveLength(0);
    expect(document.querySelector("article")).not.toBeNull();
  });

  // <script>/<style>/<noscript> content is parsed as raw text, so comments
  // written via innerHTML never become Comment nodes. To exercise the guard
  // we have to insert the Comment via the DOM API.
  it.each([
    ["script"],
    ["style"],
    ["noscript"],
  ])("preserves Comment nodes inside <%s> appended via the DOM API", (tagName) => {
    document.body.innerHTML = `<${tagName}></${tagName}>`;
    const element = document.querySelector(tagName);
    expect(element).not.toBeNull();
    element?.appendChild(document.createComment(" preserved "));

    htmlCommentStripRule.apply(document.body);

    expect(commentNodesIn(element as Node)).toHaveLength(1);
  });

  it("is idempotent on a second apply", () => {
    document.body.innerHTML = `<!-- a --><p>x</p><!-- b -->`;
    htmlCommentStripRule.apply(document.body);
    htmlCommentStripRule.apply(document.body);

    expect(commentNodesIn(document.body)).toHaveLength(0);
    expect(document.body.textContent).toContain("x");
  });
});
