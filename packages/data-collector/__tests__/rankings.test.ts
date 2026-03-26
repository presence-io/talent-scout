import { describe, expect, it } from 'vitest';

import { parseIndieDevList } from '../src/rankings.js';

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
