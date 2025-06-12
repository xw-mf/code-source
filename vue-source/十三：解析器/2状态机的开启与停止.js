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
    const element = parseTag(context)
    if (element.isSelfClosing) return element

    ancestors.push(element)
    element.children = parseChildren(context. ancestors)
    ancestors.pop()

    if (context.source.startsWith(`</${element.tag}`)) {
        parseTag(context, 'end')
    } else {
        // 缺少闭合标签
        console.error(`${element.tag} 标签缺少闭合标签`)
    }

    return element
}
