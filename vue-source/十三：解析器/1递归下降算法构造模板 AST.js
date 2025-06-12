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
                    // 结束标签，这里需要抛出错误，后文会详细解释原因
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
