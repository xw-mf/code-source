// 定义文本模式，作为一个状态表
const TextModes = {
    DATA: 'DATA',
    RCDATA: 'RCDATA',
    RAWTEXT: 'RAWTEXT',
    CDATA: 'CDATA'
}

// 解析器函数，接收模板作为参数
function parse(str) {
    // 定义上下文对象
    const context = {
        // source 是模板内容，用于在解析过程中进行消费
        source: str,
        // 解析器当前处于文本模式，初始模式为 DATA
        mode: TextModes.DATA,
        // advanceBy 函数用来消费指定数量的字符，它接收一个数字作为参数
        advanceBy(num) {
            // 根据给定字符数 num，截取位置 num 后的模板内容，并替换当前模板内容
            context.source = context.source.slice(num)
        },
        // 无论是开始标签还是结束标签，都可能存在无用的空白字符，例如 <div>
        advanceSpaces() {
            // 匹配空白字符
            const match = /^[\t\r\n\f ]+/.exec(context.source)
            if (match) {
                // 调用 advanceBy 函数消费空白字符
                context.advanceBy(match[0].length)
            }
        }
    }
    // 调用 parseChildren 函数开始进行解析，它返回解析后得到的子节点
    // parseChildren 函数接收两个参数：
    // 第一个参数是上下文对象 context
    // 第二个参数是由父代节点构成的节点栈，初始时栈为空
    const nodes = parseChildren(context, [])

    // 解析完成后，返回根节点
    return {
        type: 'Root',
        // 使用 nodes 作为根节点的 children
        children: nodes
    }
}

// parseChildren 函数会返回解析后得到的子节点
function parseChildren(context, ancestors) {
    // 定义 nodes 数组存储子节点，它将作为最终的返回值
    let nodes = []
    // 从上下文对象中取得当前状态，包括模式 mode 和模板内容 source
    const { source, mode } = context
    // 开启 while 循环，只要满足条件就会一直对字符串进行解析
    while (isEnd(context, ancestors)) {
        let node
        // 只有 DATA 模式和 RCDATA 模式才支持插值节点的解析
        if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
            // 只有 DATA 模式才支持标签节点的解析
            if (mode === TextModes.DATA && source[0] === '<') {
                if (source[1] === '!') {
                    if (source.startsWith('<!--')) {
                        // 注释
                        node = parseComment(context)
                    } else if (source.startsWith('<![CDATA[')) {
                        // CDATA
                        node = parseCDATA(context)
                    }
                } else if (source[1] === '/') {
                    // 状态机遭遇了闭合标签，此时应该抛出错误，因为它缺少与之对应的开始标签
                    console.error('无效的结束标签')
                    continue
                } else if (/[a-z]/i.test(source[1])) {
                    // 标签
                    node = parseElement(context, ancestors)
                }
            } else if (source.startsWith('{{')) {
                // 插值
                node = parseInterpolation(context)
            }
        }
        // node 不存在，说明处于其他模式，即非 DATA 模式且非 RCDATA 模式
        // 这时一切内容都作为文本处理
        if (!node) {
            node = parseText(context)
        }

        // 将节点添加到 nodes 数组中
        nodes.push(node)
    }

    // 当 while 循环停止后，说明子节点解析完毕，返回子节点
    return nodes
}

// 解析器遇到开始标签时，会将该标签压入父级节点栈，同时开启新的状态机。当解
// 析器遇到结束标签，并且父级节点栈中存在与该标签同名的开始标
// 签节点时，会停止当前正在运行的状态机
function isEnd(context, ancestors) {
    // 当模板内容解析完毕后，停止
    if (!context.source) return

    // 与父级节点栈内所有节点做比较
    for (let i = ancestors.length - 1; i >= 0; i--) {
        // 只要栈中存在与当前结束标签同名的节点，就停止状态机
        if (context.source.startsWith(`</${ancestors[i].tag}`)) {
            return true
        }
    }
}

function parseElement(context, ancestors) {
    // 调用 parseTag 函数解析开始标签
    const element = parseTag(context)
    if (element.isSelfClosing) return element

    // 切换到正确的文本模式
    if (element.tag === 'textarea' || element.tag === 'title') {
        // 如果由 parseTag 解析得到的标签是 <textarea> 或 <title>，则切换到 RCDATA 模式
        context.mode = TextModes.RCDATA
    } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
        // 如果由 parseTag 解析得到的标签是：<style>、<xmp>、<iframe>、<noembed>、<noframes>、<noscript>
        // 则切换到 RAWTEXT 模式
        context.mode = TextModes.RAWTEXT
    } else {
        // 否则切换到 DATA 模式
        context.mode = TextModes.DATA

    }

    ancestors.push(element)
    element.children = parseChildren(context.ancestors)
    ancestors.pop()

    if (context.source.startsWith(`</${element.tag}`)) {
        // 再次调用 parseTag 函数解析结束标签，传递了第二个参数：'end'
        parseTag(context, 'end')
    } else {
        // 缺少闭合标签
        console.error(`${element.tag} 标签缺少闭合标签`)
    }

    return element
}

// 由于 parseTag 既用来处理开始标签，也用来处理结束标签，因此我们设计第二个参数 type，
// 用来代表当前处理的是开始标签还是结束标签，type 的默认值为 'start'，即默认作为开始标签处理
// 当解析器遇到结束标签时，我们将 type 设置为 'end'
// 为了处理属性和指令，我们需要在 parseTag 函数中增加
// parseAttributes 解析函数
function parseTag(context, type = 'start') {
    // 从上下文对象中拿到 advanceBy 函数
    const { advanceBy, advanceSpaces } = context

    // 处理开始标签和结束标签的正则表达式不同
    const match = type === 'start'
        // 匹配开始标签
        ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
        // 匹配结束标签
        : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source)

    // 匹配成功后，正则表达式的第一个捕获组的值就是标签名称
    const tag = match[1]
    // 消费正则表达式匹配的全部内容，例如 '<div' 这段内容
    advanceBy(match[0].length)
    // 消费标签中无用的空白字符
    advanceSpaces()

    // 调用 parseAttributes 函数完成属性与指令的解析，并得到 props 数组
    // props 数组是由指令节点与属性节点共同组成的数组
    const props = parseAttributes(context)

    // 在消费匹配的内容后，如果字符串以 '/>' 开头，则说明这是一个自闭合标签
    const isSelfClosing = context.source.startsWith('/>')
    // 如果是自闭合标签，则消费 '/>'， 否则消费 '>'
    advanceBy(isSelfClosing ? 2 : 1)

    // 返回标签节点
    return {
        type: 'Element',
        // 标签名称
        tag,
        // 将 props 数组添加到标签节点上
        props,
        // 子节点留空
        children: [],
        // 自闭合标签
        isSelfClosing,
    }
}

function parseAttributes(context) {
    const { advanceBy, advanceSpaces } = context
    // 用来存储解析过程中产生的属性节点和指令节点
    const props = []

    // 开启 while 循环，不断地消费模板内容，直至遇到标签的“结束部分”为止
    while (
        !context.source.startsWith('>') &&
        !context.source.startsWith('/>')
    ) {
        // 该正则用于匹配属性名称
        const match = /^[^\t\r\n\f />][^\t\r\n\f/>=]*/.exec(context.source)
        // 得到属性名称
        const name = match[0]

        // 消费属性名称
        advanceBy(name.length)
        // 消费属性名称与等于号之间的空白字符
        advanceSpaces()
        // 消费等于号
        advanceBy(1)
        // 消费等于号与属性值之间的空白字符
        advanceSpaces()

        // 属性值
        let value = ''

        // 获取当前模板内容的第一个字符
        const quote = context.source[0]
        // 判断属性值是否被引号引用
        const isQuoted = quote === '"' || "'"
        if (isQuoted) {
            // 属性值被引号引用，消费引号
            advanceBy(1)
            // 获取下一个引号的索引
            const endQuoteIndex = context.source.indexOf(quote)
            if (endQuoteIndex > -1) {
                // 获取下一个引号之前的内容作为属性值
                value = context.source.slice(0, endQuoteIndex)
                // 消费属性值
                advanceBy(value.length)
                // 消费引号
                advanceBy(1)
            } else {
                // 缺少引号错误
                console.error('缺少引号')
            }
        } else {
            // 代码运行到这里，说明属性值没有被引号引用
            // 下一个空白字符之前的内容全部作为属性值
            const match = /^[^\t\r\n\f >]+/.exec(context.source)
            // 获取属性值
            value = match[0]
            // 消费属性值
            advanceBy(value.length)
        }
        // 消费属性值后面的空白字符
        advanceSpaces()

        // 使用属性名称 + 属性值创建一个属性节点，添加到 props 数组中
        props.push({
            type: 'Attribute',
            name,
            value,
        })
    }

    return props
}

// <div id="foo" v-show="display"></div>

// const ast = {
//     type: 'Root',
//     children: [
//         {
//             type: 'Element',
//             tag: 'div',
//             props: [
//                 // 属性
//                 { type: 'Attribute', name: 'id', value: 'foo' },
//                 { type: 'Attribute', name: 'v-show', value: 'display' }
//             ]
//         }
//     ]
// }

function parseText(context) {
    // endIndex 为文本内容的结尾索引，默认将整个模板剩余内容都作为文本内容
    let endIndex = context.source.length
    // 寻找字符 < 的位置索引
    const ltIndex = context.source.indexOf('<')
    // 寻找定界符 {{ 的位置索引
    const delimiterIndex = context.source.indexOf('{{')

    // 取 ltIndex 和当前 endIndex 中较小的一个作为新的结尾索引
    if (ltIndex > -1 && ltIndex < endIndex) {
        endIndex = ltIndex
    }
    // 取 delimiterIndex 和当前 endIndex 中较小的一个作为新的结尾索引
    if (delimiterIndex > -1 && delimiterIndex < endIndex) {
        endIndex = delimiterIndex
    }

    // 此时 endIndex 是最终的文本内容的结尾索引，调用 slice 函数截取文本内
    const content = context.source.slice(0, endIndex)
    // 消耗文本内容
    context.advanceBy(content.length)

    // 返回文本节点
    return {
        // 节点类型
        type: 'Text',
        // 调用 decodeHtml 函数解码内容
        content: decodeHtml(content)
    }
}

// 第一个参数为要被解码的文本内容
// 第二个参数是一个布尔值，代表文本内容是否作为属性值
function decodeHtml(rawText, asAttr = false) {
    let offset = 0
    const end = rawText.length
    // 经过解码后的文本将作为返回值被返回
    let decodedText = ''
    // 引用表中实体名称的最大长度
    let maxCRNameLength = 0

    // advance 函数用于消费指定长度的文本
    function advance(length) {
        offset += length
        rawText = rawText.slice(length)
    }

    // 消费字符串，直到处理完毕为止
    while (offset < end) {
        // 用于匹配字符引用的开始部分，如果匹配成功，那么 head[0] 的值将有三种可能：
        // 1. head[0] === '&'，这说明该字符引用是命名字符引用
        // 2. head[0] === '&#'，这说明该字符引用是用十进制表示的数字字符引用
        // 3. head[0] === '&#x'，这说明该字符引用是用十六进制表示的数字字符引用
        const head = /&(?:#x?)?/i.exec(rawText)
        // 如果没有匹配，说明已经没有需要解码的内容了
        if (!head) {
            // 计算剩余内容的长度
            const remaining = end - offset
            // 将剩余内容加到 decodedText 上
            decodedText += rawText.slice(0, remaining)
            // 消费剩余内容
            advance(remaining)
            break
        }

        // head.index 为匹配的字符 & 在 rawText 中的位置索引
        // 截取字符 & 之前的内容加到 decodedText 上
        decodedText += rawText.slice(0, head.index)
        // 消费字符 & 之前的内容
        advance(head.index)

        // 如果满足条件，则说明是命名字符引用，否则为数字字符引用
        if (head[0] === '&') {
            let name = ''
            let value
            // 字符 & 的下一个字符必须是 ASCII 字母或数字，这样才是合法的命名字符引用
            if (/[0-9a-z]/i.test(rawText[1])) {
                // 根据引用表计算实体名称的最大长度，
                if (!maxCRNameLength) {
                    maxCRNameLength =
                        Object.keys(namedCharacterReferences).reduce(
                            (max, name) => Math.max(max, name.length),
                            0
                        )
                }
                // 从最大长度开始对文本进行截取，并试图去引用表中找到对应的项
                for (let length = maxCRNameLength; !value && length > 0; --length) {
                    // 截取字符 & 到最大长度之间的字符作为实体名称
                    name = rawText.substr(1, length)
                    // 使用实体名称去索引表中查找对应项的值
                    value = (namedCharacterReferences)[name]
                }
                // 如果找到了对应项的值，说明解码成功
                if (value) {
                    // 检查实体名称的最后一个匹配字符是否是分号
                    const semi = name.endsWith(';')
                    // 如果解码的文本作为属性值，最后一个匹配的字符不是分号，
                    // 并且最后一个匹配字符的下一个字符是等于号（=）、ASCII 字母或数字，
                    // 由于历史原因，将字符 & 和实体名称 name 作为普通文本
                    if (
                        asAttr &&
                        !semi &&
                        /[=a-z0-9]/i.test(rawText[name.length + 1] || '')
                    ) {
                        decodedText += '&' + name
                        advance(1 + name.length)
                    } else {
                        // 其他情况下，正常使用解码后的内容拼接到 decodedText 上
                        decodedText += value
                        advance(1 + name.length)
                    }
                } else {
                    // 如果没有找到对应的值，说明解码失败
                    decodedText += '&' + name
                    advance(1 + name.length)
                }
            } else {
                // 如果字符 & 的下一个字符不是 ASCII 字母或数字，则将字符 & 作为普通文本
                decodedText += '&'
                advance(1)
            }
        }
    }
    return decodedText
}