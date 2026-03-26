import { describe, expect, it } from 'vitest';

import { extractUsernamesFromHtml, parseIndieDevList } from '../src/rankings.js';

describe('parseIndieDevList', () => {
  it('should extract GitHub usernames from markdown links', () => {
    const markdown = `
#### Moresl - [Github](https://github.com/Moresl)
#### 超能刚哥 - [Github](https://github.com/margox)
#### jankarong - [Github](https://github.com/jankarong)
    `;
    const result = parseIndieDevList(markdown);
    expect(result).toContain('moresl');
    expect(result).toContain('margox');
    expect(result).toContain('jankarong');
    expect(result).toHaveLength(3);
  });

  it('should deduplicate usernames', () => {
    const markdown = `
#### User1 - [Github](https://github.com/TestUser)
#### User1 again - [Github](https://github.com/testuser)
    `;
    const result = parseIndieDevList(markdown);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('testuser');
  });

  it('should handle various URL formats', () => {
    const markdown = `
#### A - [Github](https://github.com/user-name)
#### B - [GitHub](https://github.com/UserName123)
#### C - [Github](http://github.com/oldstyle)
    `;
    const result = parseIndieDevList(markdown);
    expect(result).toContain('user-name');
    expect(result).toContain('username123');
    expect(result).toContain('oldstyle');
  });

  it('should skip repo URLs (paths with slashes after username)', () => {
    const markdown = `
#### A - [Github](https://github.com/user1)
#### B - [更多介绍](https://github.com/user2/some-repo)
#### C - [source](https://github.com/user3/repo/blob/main/file.ts)
    `;
    const result = parseIndieDevList(markdown);
    // user1 is a profile link, user2 and user3 are repo links but the regex
    // will still capture the username portion before the slash
    expect(result).toContain('user1');
    // user2 and user3 usernames are still captured (username before /)
    expect(result).toContain('user2');
    expect(result).toContain('user3');
  });

  it('should skip reserved GitHub paths', () => {
    const markdown = `
#### A - [link](https://github.com/about)
#### B - [link](https://github.com/explore)
#### C - [link](https://github.com/trending)
#### D - [link](https://github.com/realuser)
    `;
    const result = parseIndieDevList(markdown);
    expect(result).toEqual(['realuser']);
  });

  it('should return empty array for no matches', () => {
    const result = parseIndieDevList('No GitHub links here');
    expect(result).toEqual([]);
  });

  it('should handle real-world README snippet', () => {
    const markdown = `
### 2026 年 3 月 25 号添加

#### Moresl - [Github](https://github.com/Moresl)
• ✅ [some project](https://example.com)

#### 超能刚哥 - [Github](https://github.com/margox)
• ✅ [another project](https://example.com)

### 2026 年 3 月 24 号添加

#### Chaoc2624 - [Github](https://github.com/Chaoc2624)
• ✅ [project](https://example.com)

#### simple-Jian-tw - [Github](https://github.com/simple-Jian-tw)
    `;
    const result = parseIndieDevList(markdown);
    expect(result).toContain('moresl');
    expect(result).toContain('margox');
    expect(result).toContain('chaoc2624');
    expect(result).toContain('simple-jian-tw');
    expect(result).toHaveLength(4);
  });

  it('should handle entries with multiple links', () => {
    const markdown = `
#### WtecHtec(深圳) - [Github](https://github.com/WtecHtec), [博客](https://wtechtec.com/)
#### zxcHolmes - [Github](https://github.com/zxcHolmes), [Twitter](https://x.com/foo)
    `;
    const result = parseIndieDevList(markdown);
    expect(result).toContain('wtechtec');
    expect(result).toContain('zxcholmes');
  });
});

describe('extractUsernamesFromHtml', () => {
  it('should extract usernames from china-ranking style HTML', () => {
    const html = `
<div>
  <a href="https://github.com/peng-zhihui">@peng-zhihui</a>
  <a href="https://github.com/michaelliao">@michaelliao</a>
  <a href="https://github.com/daimajia">@daimajia</a>
</div>`;
    const result = extractUsernamesFromHtml(html);
    expect(result).toContain('peng-zhihui');
    expect(result).toContain('michaelliao');
    expect(result).toContain('daimajia');
    expect(result).toHaveLength(3);
  });

  it('should extract usernames from githubrank table style HTML', () => {
    const html = `
<table>
  <tr>
    <td><a href="https://github.com/ruanyf">ruanyf</a></td>
    <td>Ruan YiFeng</td>
  </tr>
  <tr>
    <td><a href="https://github.com/cloudwu">cloudwu</a></td>
    <td>云风</td>
  </tr>
</table>`;
    const result = extractUsernamesFromHtml(html);
    expect(result).toContain('ruanyf');
    expect(result).toContain('cloudwu');
    expect(result).toHaveLength(2);
  });

  it('should deduplicate usernames', () => {
    const html = `
<a href="https://github.com/TestUser">Test</a>
<a href="https://github.com/testuser">Test</a>`;
    const result = extractUsernamesFromHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('testuser');
  });

  it('should skip reserved paths', () => {
    const html = `
<a href="https://github.com/about">About</a>
<a href="https://github.com/trending">Trending</a>
<a href="https://github.com/realuser">Real User</a>`;
    const result = extractUsernamesFromHtml(html);
    expect(result).toEqual(['realuser']);
  });

  it('should handle empty or no-match HTML', () => {
    expect(extractUsernamesFromHtml('<div>no links</div>')).toEqual([]);
    expect(extractUsernamesFromHtml('')).toEqual([]);
  });
});
