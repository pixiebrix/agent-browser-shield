# JustDeleteMe — MIT License

This directory ships a vendored snapshot of the JustDeleteMe (https://justdelete.me/)
account-deletion difficulty grades, consumed by `extension/src/rules/roach-motel-flag.ts`
as a fallback source after the hand-curated YAMLs under `extension/data/sites/`.

Source: https://github.com/justdeleteme/justdelete.me/blob/master/sites.json
Refresh: `uv run scripts/fetch_justdeleteme.py`

The snapshot is filtered to entries graded `hard` or `impossible`; per-site
fields used are `name`, `domains`, `difficulty`, `url`, and `notes` (English).

---

The MIT License (MIT)

Copyright (c) 2013 Robb Lewis & various contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
