---
title: Markdown 教程
published: 2025-01-20
pinned: true
description: 这是一篇关于 Markdown 博客文章的简单示例。
tags: [Markdown, 博客]
category: 示例
licenseName: "Unlicensed"
author: emn178
sourceLink: "https://github.com/emn178/markdown"
draft: false
---

# Markdown 教程

本文通过一个 Markdown 示例展示如何编写 Markdown 文件。文档整合了核心语法和扩展语法（GMF）。

- [块级元素](#块级元素)
  - [段落和换行](#段落和换行)
  - [标题](#标题)
  - [引用块](#引用块)
  - [列表](#列表)
  - [代码块](#代码块)
  - [水平分隔线](#水平分隔线)
  - [表格](#表格)
- [行内元素](#行内元素)
  - [链接](#链接)
  - [强调](#强调)
  - [代码](#代码)
  - [图片](#图片)
  - [删除线](#删除线)
- [杂项](#杂项)
  - [自动链接](#自动链接)
  - [反斜杠转义](#反斜杠转义)
- [行内 HTML](#行内-html)

## 块级元素

### 段落和换行

#### 段落

HTML 标签：`<p>`

一个或多个空行。（空行是指只包含**空格**或**制表符**的行。）

代码：

    这会显示
    在一行内。

    这是第二个段落。

预览：

---

这会显示
在一行内。

这是第二个段落。

---

#### 换行

HTML 标签：`<br />`

在一行的末尾添加**两个或更多空格**。

代码：

    这不会
    显示在一行内。

预览：

---

这不会
显示在一行内。

---

### 标题

Markdown 支持两种风格的标题：Setext 和 atx。

#### Setext

HTML 标签：`<h1>`、`<h2>`

使用**等号（=）**作为 `<h1>` 的"下划线"，使用**短横线（-）**作为 `<h2>` 的"下划线"，数量不限。

代码：

    这是一级标题
    =============

    这是二级标题
    -------------

预览：

---

# 这是一级标题

## 这是二级标题

---

#### atx

HTML 标签：`<h1>`、`<h2>`、`<h3>`、`<h4>`、`<h5>`、`<h6>`

在行首使用 1-6 个**井号（#）**，分别对应 `<h1>` 到 `<h6>`。

代码：

    # 这是一级标题
    ## 这是二级标题
    ###### 这是六级标题

预览：

---

# 这是一级标题

## 这是二级标题

###### 这是六级标题

---

可选地，你可以"闭合" atx 风格的标题。闭合的井号**不需要与**开头的井号数量匹配。

代码：

    # 这是一级标题 #
    ## 这是二级标题 ##
    ### 这是三级标题 ######

预览：

---

# 这是一级标题

## 这是二级标题

### 这是三级标题

---

### 引用块

HTML 标签：`<blockquote>`

Markdown 使用电子邮件风格的**大于号（>）**来创建引用块。如果要硬换行文本并在每行前加 `>`，效果会更好。

代码：

    > 这是一个包含两个段落的引用块。Lorem ipsum dolor sit amet,
    > consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
    > Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.
    >
    > Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
    > id sem consectetuer libero luctus adipiscing.

预览：

---

> 这是一个包含两个段落的引用块。Lorem ipsum dolor sit amet,
> consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
> Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.
>
> Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
> id sem consectetuer libero luctus adipiscing.

---

Markdown 允许你偷懒，只在硬换行段落的第一行前加 `>`。

代码：

    > 这是一个包含两个段落的引用块。Lorem ipsum dolor sit amet,
    consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
    Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.

    > Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
    id sem consectetuer libero luctus adipiscing.

预览：

---

> 这是一个包含两个段落的引用块。Lorem ipsum dolor sit amet,
> consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
> Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.

> Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
> id sem consectetuer libero luctus adipiscing.

---

可以通过添加额外的 `>` 层级来嵌套引用块（即引用块中的引用块）。

代码：

    > 这是第一层引用。
    >
    > > 这是嵌套的引用块。
    >
    > 回到第一层。

预览：

---

> 这是第一层引用。
>
> > 这是嵌套的引用块。
>
> 回到第一层。

---

引用块可以包含其他 Markdown 元素，包括标题、列表和代码块。

代码：

    > ## 这是一个标题。
    >
    > 1. 这是第一个列表项。
    > 2. 这是第二个列表项。
    >
    > 这里是一些示例代码：
    >
    >     return shell_exec("echo $input | $markdown_script");

预览：

---

> ## 这是一个标题。
>
> 1. 这是第一个列表项。
> 2. 这是第二个列表项。
>
> 这里是一些示例代码：
>
>     return shell_exec("echo $input | $markdown_script");

---

### 列表

Markdown 支持有序列表（编号）和无序列表（项目符号）。

#### 无序列表

HTML 标签：`<ul>`

无序列表使用**星号（\*）**、**加号（+）**和**短横线（-）**。

代码：

    *   红色
    *   绿色
    *   蓝色

预览：

---

- 红色
- 绿色
- 蓝色

---

效果等同于：

代码：

    +   红色
    +   绿色
    +   蓝色

和：

代码：

    -   红色
    -   绿色
    -   蓝色

#### 有序列表

HTML 标签：`<ol>`

有序列表使用数字加句点：

代码：

    1.  鸟
    2.  麦克海尔
    3.  帕里什

预览：

---

1. 鸟
2. 麦克海尔
3. 帕里什

---

可能会意外触发有序列表，比如这样写：

代码：

    1986. 多么精彩的赛季。

预览：

---

1986. 多么精彩的赛季。

---

你可以用**反斜杠转义（\\）**来转义句点：

代码：

    1986\. 多么精彩的赛季。

预览：

---

1986\. 多么精彩的赛季。

---

#### 缩进列表

##### 引用块

要在列表项中放入引用块，需要对引用块的 `>` 定界符进行缩进：

代码：

    *   带有引用块的列表项：

        > 这是引用块
        > 在列表项内部。

预览：

---

- 带有引用块的列表项：

  > 这是引用块
  > 在列表项内部。

---

##### 代码块

要在列表项中放入代码块，需要对代码块缩进两次——**8 个空格**或**两个制表符**：

代码：

    *   带有代码块的列表项：

            <code goes here>

预览：

---

- 带有代码块的列表项：

      <code goes here>

---

##### 嵌套列表

代码：

    * A
      * A1
      * A2
    * B
    * C

预览：

---

- A
  - A1
  - A2
- B
- C

---

### 代码块

HTML 标签：`<pre>`

将代码块的每一行至少缩进 **4 个空格**或 **1 个制表符**。

代码：

    这是一个普通段落：

        这是一个代码块。

预览：

---

这是一个普通段落：

    这是一个代码块。

---

代码块会一直延续，直到遇到非缩进的行（或文章结束）。

在代码块中，**和号（&）**和**尖括号（< 和 >）**会自动转换为 HTML 实体。

代码：

        <div class="footer">
            &copy; 2004 Foo Corporation
        </div>

预览：

---

    <div class="footer">
        &copy; 2004 Foo Corporation
    </div>

---

接下来的"围栏代码块"和"语法高亮"小节是扩展语法，你可以用另一种方式来写代码块。

#### 围栏代码块

只需要用 ` ``` ` 包裹你的代码（如所示），就不需要缩进四个空格了。

代码：

    例如：

    ```
    function test() {
      console.log("注意这个函数前面的空行？");
    }
    ```

预览：

---

例如：

```
function test() {
  console.log("注意这个函数前面的空行？");
}
```

---

#### 语法高亮

在围栏代码块中，添加一个可选的语言标识符，我们会对其进行语法高亮处理（支持的语言列表）。

代码：

    ```ruby
    require 'redcarpet'
    markdown = Redcarpet.new("Hello World!")
    puts markdown.to_html
    ```

预览：

---

```ruby
require 'redcarpet'
markdown = Redcarpet.new("Hello World!")
puts markdown.to_html
```

---

### 水平分隔线

HTML 标签：`<hr />`

在一行上放置**三个或更多短横线（-）、星号（\*）或下划线（\_）**。你可以在短横线或星号之间使用空格。

代码：

    * * *
    ***
    *****
    - - -
    ---------------------------------------
    ___

预览：

---

***

---

---

---

---

---

---

---

---

### 表格

HTML 标签：`<table>`

这是一个扩展语法。

用**管道符（|）**分隔列，用**短横线（-）**分隔表头，用**冒号（:）**设置对齐方式。

外层的**管道符（|）**和对齐方式是可选的。每个单元格至少需要 **3 个定界符**来分隔表头。

代码：

```
| 左对齐 | 居中 | 右对齐 |
|:------|:----:|------:|
|aaa    |bbb   |ccc    |
|ddd    |eee   |fff    |

 A | B
---|---
123|456


A |B
--|--
12|45
```

预览：

---

| 左对齐 | 居中 | 右对齐 |
| :--- | :----: | ----: |
| aaa  |  bbb   |   ccc |
| ddd  |  eee   |   fff |

| A   | B   |
| --- | --- |
| 123 | 456 |

| A   | B   |
| --- | --- |
| 12  | 45  |

---

## 行内元素

### 链接

HTML 标签：`<a>`

Markdown 支持两种链接风格：行内式和引用式。

#### 行内式

行内式链接格式如下：`[链接文本](URL "标题")`

标题是可选的。

代码：

    这是一个[示例链接](http://example.com/ "标题")。

    [这个链接](http://example.net/) 没有 title 属性。

预览：

---

这是一个[示例链接](http://example.com/ "标题")。

[这个链接](http://example.net/) 没有 title 属性。

---

如果你引用的是同一服务器上的本地资源，可以使用相对路径：

代码：

    详情请参阅我的[关于页面](/about/)。

预览：

---

详情请参阅我的[关于页面](/about/)。

---

#### 引用式

你可以预先定义链接引用。格式如下：`[id]: URL "标题"`

标题也是可选的。然后用这种格式引用链接：`[链接文本][id]`

代码：

    [id]: http://example.com/  "可选标题"
    这是一个[示例链接][id] 引用式链接。

预览：

---

[id]: http://example.com/ "可选标题"

这是一个[示例链接][id] 引用式链接。

---

即：

- 包含链接标识符的方括号（**不区分大小写**，可选从左边缘缩进最多三个空格）；
- 后面跟着一个冒号；
- 后面跟着一个或多个空格（或制表符）；
- 后面跟着链接的 URL；
- 链接 URL 可以可选地用尖括号包围。
- 可选地跟着一个链接的 title 属性，用双引号或单引号包围，或用圆括号包围。

以下三个链接定义是等效的：

代码：

    [foo]: http://example.com/  "可选标题"
    [foo]: http://example.com/  '可选标题'
    [foo]: http://example.com/  (可选标题)
    [foo]: <http://example.com/>  "可选标题"

使用空方括号集，链接文本本身用作名称。

代码：

    [Google]: http://google.com/
    [Google][]

预览：

---

[Google]: http://google.com/

[Google][]

---

### 强调

HTML 标签：`<em>`、`<strong>`

Markdown 将**星号（\*）**和**下划线（\_）**视为强调的标记。**单个定界符**会变成 `<em>`；**双个定界符**会变成 `<strong>`。

代码：

    *单个星号*

    _单个下划线_

    **双个星号**

    __双个下划线__

预览：

---

_单个星号_

_单个下划线_

**双个星号**

**双个下划线**

---

但是如果你在 \* 或 \_ 两侧留有空格，它会被当作字面意义的星号或下划线。

你可以用反斜杠转义：

代码：

    \*这个文本被字面星号包围\*

预览：

---

\*这个文本被字面星号包围\*

---

### 代码

HTML 标签：`<code>`

用**反引号（`）**包裹。

代码：

    使用 `printf()` 函数。

预览：

---

使用 `printf()` 函数。

---

要在代码跨度中包含字面反引号字符，可以使用**多个反引号**作为开始和结束定界符：

代码：

    ``这里有一个字面反引号（`）在这里。``

预览：

---

``这里有一个字面反引号（`）在这里。``

---

围绕代码跨度的反引号定界符可以包含空格——开头后一个，结尾前一个。这允许你在代码跨度的开头或结尾放置字面反引号字符：

代码：

    代码跨度中的单个反引号：`` ` ``

    代码跨度中的反引号分隔字符串：`` `foo` ``

预览：

---

代码跨度中的单个反引号：`` ` ``

代码跨度中的反引号分隔字符串：`` `foo` ``

---

### 图片

HTML 标签：`<img />`

Markdown 使用的图片语法旨在与链接语法相似，支持两种风格：行内式和引用式。

#### 行内式

行内式图片语法如下：`![替代文本](URL "标题")`

标题是可选的。

代码：

    ![替代文本](/path/to/img.jpg)

    ![替代文本](/path/to/img.jpg "可选标题")

预览：

---

![替代文本](https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp)

![替代文本](https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp "可选标题")

---

即：

- 一个感叹号：!；
- 后面跟着一组方括号，包含图片的 alt 属性文本；
- 后面跟着一组圆括号，包含图片的 URL 或路径，以及可选的用双引号或单引号包围的 title 属性。

#### 引用式

引用式图片语法如下：`![替代文本][id]`

代码：

    [img id]: https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp  "可选标题属性"
    ![替代文本][img id]

预览：

---

[img id]: https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp "可选标题属性"

![替代文本][img id]

---

### 删除线

HTML 标签：`<del>`

这是一个扩展语法。

GFM 添加了删除线文本的语法。

代码：

```
~~错误的文本。~~
```

预览：

---

~~错误的文本。~~

---

## 杂项

### 自动链接

Markdown 支持一种快捷方式来创建 URL 和电子邮件地址的"自动"链接：只需用尖括号包围 URL 或电子邮件地址。

代码：

    <http://example.com/>

    <address@example.com>

预览：

---

<http://example.com/>

<address@example.com>

---

GFM 会自动链接标准 URL。

代码：

```
https://github.com/emn178/markdown
```

预览：

---

https://github.com/emn178/markdown

---

### 反斜杠转义

Markdown 允许你使用反斜杠转义来生成字面字符，否则这些字符在 Markdown 的格式化语法中有特殊含义。

代码：

    \*字面星号\*

预览：

---

\*字面星号\*

---

Markdown 为以下字符提供反斜杠转义：

代码：

    \   反斜杠
    `   反引号
    *   星号
    _   下划线
    {}  花括号
    []  方括号
    ()  圆括号
    #   井号
    +   加号
    -   减号（连字符）
    .   句点
    !   感叹号

## 行内 HTML

对于 Markdown 语法未涵盖的任何标记，你只需直接使用 HTML。无需在其前面加前缀或定界来表明你正在从 Markdown 切换到 HTML；直接使用标签即可。

代码：

    这是一个普通段落。

    <table>
        <tr>
            <td>Foo</td>
        </tr>
    </table>

    这是另一个普通段落。

预览：

---

这是一个普通段落。

<table>
    <tr>
        <td>Foo</td>
    </tr>
</table>

这是另一个普通段落。

---

注意：Markdown 格式化语法**不会在块级 HTML 标签内处理**。

与块级 HTML 标签不同，Markdown 语法**会在行内级标签内处理**。

代码：

    <span>**会生效**</span>

    <div>
        **不会生效**
    </div>

预览：

---

<span>**会生效**</span>

<div>
  **不会生效**
</div>
***