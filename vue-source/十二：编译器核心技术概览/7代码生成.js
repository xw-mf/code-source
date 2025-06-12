// Vue.js 模板编译器的基本结构和工作流程
//      1. 用来将模板字符串解析为模板 AST 的解析器（parser）；
//      2. 用来将模板 AST 转换为 JavaScript AST 的转换器 （transformer）；
//      3. 用来根据 JavaScript AST 生成渲染函数代码的生成器（generator）。

// 定义状态机的状态
const State = {
    // 初始状态
    initial: 1,
    // 标签开始状态
    tagOpen: 2,
    // 标签名称状态
    tagName: 3,
    // 文本状态
    text: 4,
    // 结束标签状态
    tagEnd: 5,
    // 结束标签名称状态
    tagEndName: 6
}

// 一个辅助函数，用于判断是否是字母
function isAlpha(char) {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
}

// 接收模板字符串作为参数，并将模板切割为 Token 返回
function tokenize(str) {
    // 状态机的当前状态：初始状态
    let currentState = State.initial
    // 用于缓存字符
    const chars = []
    // 生成的 Token 会存储到 tokens 数组中，并作为函数的返回值返回
    const tokens = []
    // 使用 while 循环开启自动机，只要模板字符串没有被消费尽，自动机就会一直运行
    while (str) {
        // 查看第一个字符，注意，这里只是查看，没有消费该字符
        const char = str[0]
        // switch 语句匹配当前状态
        switch (currentState) {
            // 初始状态
            case State.initial:
                // 如果是 < 字符，说明是标签开始状态
                if (char === '<') {
                    // 1. 状态机切换到标签开始状态
                    currentState = State.tagOpen
                    // 2. 消费掉 < 字符
                    str = str.slice(1)
                } else if (isAlpha(char)) {
                    // 1. 遇到字母，切换到文本状态
                    currentState = State.text
                    // 2. 将当前字母缓存到 chars 数组
                    chars.push(char)
                    // 3. 消费掉当前字母
                    str = str.slice(1)
                }
                break
            // 标签开始状态
            case State.tagOpen:
                // 如果是字母，说明是标签名称状态
                if (isAlpha(char)) {
                    // 1. 遇到字母，切换到标签名称状态
                    currentState = State.tagName
                    // 2. 将当前字母缓存到 chars 数组
                    chars.push(char)
                    // 3. 消费掉当前字母
                    str = str.slice(1)
                } else if (char === '/') {
                    // 1. 遇到 / 字符，切换到结束标签状态
                    currentState = State.tagEnd
                    // 2. 消费掉 / 字符
                    str = str.slice(1)
                }
                break
            // 标签名称状态
            case State.tagName:
                // 如果是字母，说明还是标签名称状态
                if (isAlpha(char)) {
                    // 1. 遇到字母，由于当前处于标签名称状态，所以不需要切换状态，
                    // 但需要将当前字符缓存到 chars 数组
                    chars.push(char)
                    // 2. 消费掉当前字母
                    str = str.slice(1)
                } else if (char === '>') {
                    // 1. 遇到 > 字符，说明标签名称状态结束，切换到初始状态
                    currentState = State.initial
                    // 2. 同时创建一个标签 Token，并添加到 tokens 数组中
                    // 注意，此时 chars 数组中缓存的字符就是标签名称
                    tokens.push({
                        type: 'tag',
                        name: chars.join('')
                    })
                    // 3. chars 数组的内容已经被消费，清空它
                    chars.length = 0
                    // 4. 消费掉 > 字符
                    str = str.slice(1)
                }
                break
            // 文本状态
            case State.text:
                if (isAlpha(char)) {
                    // 1. 遇到字母，保持状态不变，但应该将当前字符缓存到 chars 数组
                    chars.push(char)
                    // 2. 消费掉当前字母
                    str = str.slice(1)
                } else if (char === '<') {
                    // 1. 遇到 < 字符，说明文本状态结束，切换到标签开始状态
                    currentState = State.tagOpen
                    // 2. 从 文本状态 --> 标签开始状态，此时应该创建文本 Token，并添加到 tokens 数组
                    // 注意，此时 chars 数组中的字符就是文本内容
                    tokens.push({
                        type: 'text',
                        content: chars.join('')
                    })
                    // 3. chars 数组的内容已经被消费，清空它
                    chars.length = 0
                    // 4. 消费掉 < 字符
                    str = str.slice(1)
                }
                break
            // 结束标签状态
            case State.tagEnd:
                // 如果是字母，说明是结束标签名称状态
                if (isAlpha(char)) {
                    // 1. 遇到字母，切换到结束标签名称状态
                    currentState = State.tagEndName
                    // 2. 将当前字母缓存到 chars 数组
                    chars.push(char)
                    // 3. 消费掉当前字母
                    str = str.slice(1)
                }
                break
            // 结束标签名称状态
            case State.tagEndName:
                // 如果是字母，说明还是结束标签名称状态
                if (isAlpha(char)) {
                    // 1. 遇到字母，保持状态不变，但应该将当前字符缓存到 chars 数组
                    chars.push(char)
                    // 2. 消费掉当前字母
                    str = str.slice(1)
                } else if (char === '>') {
                    // 1. 遇到 > 字符，说明结束标签名称状态结束，切换到初始状态
                    currentState = State.initial
                    // 2. 从 结束标签名称状态 --> 初始状态，同时创建一个结束标签 Token，并添加到 tokens 数组中
                    // 注意，此时 chars 数组中缓存的字符就是结束标签名称
                    tokens.push({
                        type: 'tagEnd',
                        name: chars.join('')
                    })
                    // 3. chars 数组的内容已经被消费，清空它
                    chars.length = 0
                    // 4. 消费掉 > 字符
                    str = str.slice(1)
                }
                break
        }
    }

    return tokens
}

const tokens = tokenize('<div><p>Vue</p><p>Template</p></div>')
// [
//     { type: 'tag', name: 'div' },
//     { type: 'tag', name: 'p' },
//     { type: 'text', content: 'Vue' },     
//     { type: 'tagEnd', name: 'p' },        
//     { type: 'tag', name: 'p' },
//     { type: 'text', content: 'Template' },
//     { type: 'tagEnd', name: 'p' },        
//     { type: 'tagEnd', name: 'div' }       
// ]

// parse 函数接收模板作为参数
function parse(str) {
    // 首先对模板进行标记化，得到 tokens
    const tokens = tokenize(str)
    // 创建 Root 根节点
    const root = {
        type: 'Root',
        children: []
    }
    // 创建 elementStack 栈，起初只有 Root 根节点
    const elementStack = [root]
    // 开启一个 while 循环扫描 tokens，直到所有 Token 都被扫描完毕为止
    while (tokens.length) {
        // 获取当前栈顶节点作为父节点 parent
        const parent = elementStack[elementStack.length - 1]
        // 当前扫描的 Token
        const t = tokens[0]
        // 处理 Token
        switch (t.type) {
            case 'tag':
                // 如果当前 Token 是开始标签，则创建 Element 类型的 AST 节点
                const elementNode = {
                    type: 'Element',
                    tag: t.name,
                    children: []
                }
                // 将其添加到父级节点的 children 中
                parent.children.push(elementNode)
                // 同时将该节点压入栈中
                elementStack.push(elementNode)
                break;
            case 'text':
                // 如果当前 Token 是文本，则创建 Text 类型的 AST 节点
                const textNode = {
                    type: 'Text',
                    content: t.content
                }
                // 将其添加到父级节点的 children 中
                parent.children.push(textNode)
                break;
            case 'tagEnd':
                // 如果当前 Token 是结束标签，则弹出栈顶节点
                elementStack.pop()
                break;
            default:
                break;
        }
        // 消费已经扫描过的 token
        tokens.shift()
    }

    // 最后返回 AST
    return root
}

function dump(node, indent = 0) {
    // 节点的类型
    const type = node.type
    // 节点的描述，如果是根节点，则没有描述
    // 如果是 Element 类型的节点，则使用 node.tag 作为节点的描述
    // 如果是 Text 类型的节点，则使用 node.content 作为节点的描述
    const desc = node.type === 'Root' ? '' : node.type === 'Element' ? node.tag : node.content
    // 打印节点的类型和描述信息
    console.log(`${'-'.repeat(indent)}${type}: ${desc}`)

    // 递归地打印子节点
    if (node.children) {
        node.children.forEach(child => dump(child, indent + 2))
    }
}

// 实现对 AST 中节点的访问
function traverseNode(ast, context) {
    // 设置当前转换的节点信息 context.currentNode
    context.currentNode = ast
    // 1. 增加退出阶段的回调函数数组
    const exitFns = []

    // context.nodeTransforms 是一个数组，其中每一个元素都是一个函数
    const transforms = context.nodeTransforms

    for (let i = 0; i < transforms.length; i++) {
        // 将当前节点 currentNode 和 context 都传递给 nodeTransforms 中注册的回调函数
        // 2. 转换函数可以返回另外一个函数，该函数即作为退出阶段的回调函数
        const onExit = transforms[i](context.currentNode, context)
        if (onExit) {
            // 将退出阶段的回调函数添加到 exitFns 数组中
            exitFns.push(onExit)
        }
        // 由于任何转换函数都可能移除当前节点，因此每个转换函数执行完毕后，
        // 都应该检查当前节点是否已经被移除，如果被移除了，直接返回即可
        if (!context.currentNode) return
    }

    // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
    const children = context.currentNode.children
    if (children) {
        for (let i = 0; i < children.length; i++) {
            // 递归地调用 traverseNode 转换子节点之前，将当前节点设置为父节点
            context.parent = context.currentNode
            // 设置位置索引
            context.childIndex = i
            // 递归地调用时，将 context 透传
            traverseNode(children[i], context)
        }
    }

    // 在节点处理的最后阶段执行缓存到 exitFns 中的回调函数
    // 注意，这里我们要反序执行
    let i = exitFns.length
    while (i--) {
        exitFns[i]()
    }
}

function transform(ast) {
    // 在 transform 函数内创建 context 对象
    const context = {
        // 增加 currentNode，用来存储当前正在转换的节点
        currentNode: null,
        // 增加 childIndex，用来存储当前节点在父节点的 children 中的位置索引
        childIndex: 0,
        // 增加 parent，用来存储当前转换节点的父节点
        parent: null,
        // 用于替换节点的函数，接收新节点作为参数
        replaceNode(node) {
            // 为了替换节点，我们需要修改 AST
            // 找到当前节点在父节点的 children 中的位置：context.childIndex
            // 然后使用新节点替换即可
            context.parent.children[context.childIndex] = node
            // 由于当前节点已经被新节点替换掉了，因此我们需要将 currentNode 更新为新节点
            context.currentNode = node
        },
        // 用于删除当前节点。
        removeNode() {
            if (context.parent) {
                // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
                context.parent.children.splice(context.childIndex, 1)
                // 将 context.currentNode 置空
                context.currentNode = null
            }
        },
        // 注册 nodeTransforms 数组
        nodeTransforms: [
            // transformElement 函数用来转换标签节点
            transformElement,
            // transformText 函数用来转换文本节点
            transformText,
            transformRoot
        ]
    }
    // 调用 traverseNode 完成转换
    traverseNode(ast, context)
    // 打印 AST 信息
    dump(ast)
}

// 使用 CallExpression 类型的节点来描述函数调用语句
const CallExp = {
    type: 'CallExpression',
    // 被调用函数的名称，它是一个标识符
    callee: {
        type: 'Identifier',
        name: 'h'
    },
    // 参数
    arguments: []
}

// 字符串字面量
const Str = {
    type: 'StringLiteral',
    value: ''
}

// 数组
const Arr = {
    type: 'ArrayExpression',
    // 数组中的元素
    elements: []
}

// <div><p>Vue</p><p>Template</p></div>
// function render() {
//     return h('div', [
//         h('p', 'Vue'),
//         h('p', 'Template')
//     ])
// }

// 描述函数声明语句
const FunctionDeclNode = {
    type: 'FunctionDecl', // 代表该节点是函数声明
    // 函数的名称是一个标识符，标识符本身也是一个节点
    id: {
        type: 'Identifier',
        name: 'render' // name 用来存储标识符的名称，在这里它就是渲染函数的名称render
    },
    params: [], // 参数，目前渲染函数还不需要参数，所以这里是一个空数组
    // 渲染函数的函数体只有一个语句，即 return 语句
    body: [
        {
            type: 'ReturnStatement',
            return: {
                type: 'CallExpression',
                callee: {
                    type: 'Identifier',
                    name: 'h'
                },
                arguments: [
                    // 第一个参数是字符串字面量 'div'
                    {
                        type: 'StringLiteral',
                        value: 'div'
                    },
                    // 第二个参数是数组表达式
                    {
                        type: 'ArrayExpression',
                        elements: [
                            // 数组的第一个元素是 h 函数的调用
                            {
                                type: 'CallExpression',
                                callee: {
                                    type: 'Identifier',
                                    name: 'h'
                                },
                                arguments: [
                                    // 第一个参数是字符串字面量 'p'
                                    {
                                        type: 'StringLiteral',
                                        value: 'p'
                                    },
                                    // 第二个参数是字符串字面量 'Vue'
                                    {
                                        type: 'StringLiteral',
                                        value: 'Vue'
                                    }
                                ]
                            },
                            // 数组的第二个元素也是 h 函数的调用
                            {
                                type: 'CallExpression',
                                callee: {
                                    type: 'Identifier',
                                    name: 'h'
                                },
                                arguments: [
                                    // 第一个参数是字符串字面量 'p'
                                    {
                                        type: 'StringLiteral',
                                        value: 'p'
                                    },
                                    // 第二个参数是字符串字面量 'Template'
                                    {
                                        type: 'StringLiteral',
                                        value: 'Template'
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    ]
}
// 如上面这段 JavaScript AST 的代码所示，它是对渲染函数代码的完整描述
// 编写转换函数，将模板 AST 转换为上述 JavaScript AST

// 用来创建 StringLiteral 节点
function createStringLiteral(value) {
    return {
        type: 'StringLiteral',
        value
    }
}

// 用来创建 Identifier 节点
function createIdentifier(name) {
    return {
        type: 'Identifier',
        name
    }
}

// 用来创建 ArrayExpression 节点
function createArrayExpression(elements) {
    return {
        type: 'ArrayExpression',
        elements
    }
}

// 用来创建 CallExpression 节点
function createCallExpression(callee, args) {
    return {
        type: 'CallExpression',
        callee: createIdentifier(callee),
        arguments: args
    }
}


// 转换函数的第二个参数就是 context 对象
function transformText(node, context) {
    if (node.type !== 'Text') return
    // 文本节点对应的 JavaScript AST 节点其实就是一个字符串字面量，
    // 因此只需要使用 node.content 创建一个 StringLiteral 类型的节点即可
    // 最后将文本节点对应的 JavaScript AST 节点添加到 node.jsNode 属性下
    node.jsNode = createStringLiteral(node.content)
}

// 转换标签节点
function transformElement(node) {
    // 将转换代码编写在退出阶段的回调函数中，
    // 这样可以保证该标签节点的子节点全部被处理完毕
    return () => {
        // 在这里编写退出节点的逻辑，当这里的代码运行时，当前转换节点的子节点一定处理完毕了
        if (node.type !== 'Element') return
        // 1. 创建 h 函数调用语句,
        // h 函数调用的第一个参数是标签名称，因此我们以 node.tag 来创建一个字符串字面量节点
        // 作为第一个参数
        const callExp = createCallExpression('h', [
            createStringLiteral(node.tag)
        ])
        // 2. 处理 h 函数调用的参数
        node.children.length === 1
        // 如果当前标签节点只有一个子节点，则直接使用子节点的 jsNode 作为参数
        ? callExp.arguments.push(node.children[0].jsNode)
        // 如果当前标签节点有多个子节点，则需要将它们转换为一个数组
        : callExp.arguments.push(createArrayExpression(
            node.children.map(child => child.jsNode)
        ))
        // 3. 将当前标签节点对应的 JavaScript AST 添加到 jsNode 属性下
        node.jsNode = callExp
    }
}

// 转换 Root 根节点
function transformRoot(node) {
    // 将逻辑编写在退出阶段的回调函数中，保证子节点全部被处理完毕
    return () => {
        // 如果不是根节点，则什么都不做
        if (node.type!== 'Root') return
        // node 是根节点，根节点的第一个子节点就是模板的根节点，
        // 当然，这里我们暂时不考虑模板存在多个根节点的情况
        const vnodeJSAST = node.children[0].jsNode
        // 创建 render 函数的声明语句节点，将 vnodeJSAST 作为 render 函数体的返回语句
        node.jsNode = {
            type: 'FunctionDecl',
            id: createIdentifier('render'),
            params: [],
            body: [
                {
                    type: 'ReturnStatement',
                    return: vnodeJSAST
                }
            ]
        }
    }
}

function compile(template) {
    // 模板 AST
    const ast = parse(template)
    // 将模板 AST 转换为 JavaScript AST
    transform(ast)
    // 将 JavaScript AST 转换为 JavaScript 代码
    const code = generate(ast.jsNode)

    return code
}

function generate(node) {
    const context = {
        // 存储最终生成的渲染函数代码
        code: '',
        // 在生成代码时，通过调用 push 函数完成代码的拼接
        push(code) {
            context.code += code
        },
        // 当前缩进的级别，初始值为 0，即没有缩进
        currentIndent: 0,
        // 该函数用来换行，即在代码字符串的后面追加 \n 字符，
        // 另外，换行时应该保留缩进，所以我们还要追加 currentIndent * 2 个空格字符
        newline() {
            context.code += '\n' + ' '.repeat(context.currentIndent * 2)
        },
        // 用来缩进，即让 currentIndent 自增后，调用换行函数
        indent() {
            context.currentIndent++
            context.newline()
        },
        // 取消缩进，即让 currentIndent 自减后，调用换行函数
        deIndent() {
           context.currentIndent--
           context.newline() 
        }
    }

    // 调用 genNode 函数完成代码生成的工作，
    genNode(node, context)

    // 返回渲染函数代码
    return context.code
}

function genNode(node, context) {
    switch (node.type) {
        case 'FunctionDecl':
            genFunctionDecl(node, context)
            break;
        case 'ReturnStatement':
            genReturnStatement(node, context)
            break;
        case 'StringLiteral':
            genStringLiteral(node, context)
            break;
        case 'ArrayExpression':
            genArrayExpression(node, context)
            break;
        case 'CallExpression':
            genCallExpression(node, context)
            break;
    }
}

function genFunctionDecl(node, context) {
    // 从 context 对象中取出工具函数
    const { push, indent, deIndent } = context
    // node.id 是一个标识符，用来描述函数的名称，即 node.id.name
    push(`function ${node.id.name} `)
    push(`(`)
    // 调用 genNodeList 为函数的参数生成代码
    genNodeList(node.params, context)
    push(`) `)
    push(`{`)
    // 缩进
    indent()
    // 为函数体生成代码，这里递归地调用了 genNode 函数
    node.body.forEach(item => genNode(item, context))
    // 取消缩进
    deIndent()
    push(`}`)
}

// genNodeList 函数接收一个节点数组作为参数，并为每一个节点
// 递归地调用 genNode 函数完成代码生成工作。这里要注意的一点是，
// 每处理完一个节点，需要在生成的代码后面拼接逗号字符（,）
function genNodeList(nodes, context) {
    const { push } = context
    for (let i = 0; i < nodes.length; i++) {
        genNode(nodes[i], context)
        if (i < nodes.length - 1) {
            push(`, `)
        }
    }
}

function genArrayExpression(node, context) {
    const { push } = context
    // 追加方括号
    push(`[`)
    // 调用 genNodeList 为数组元素生成代码
    genNodeList(node.elements, context)
    // 补全方括号
    push(`]`)
}

function genReturnStatement(node, context) {
    const { push } = context
    // 追加 return 关键字
    push(`return `)
    // 为 return 语句后面的表达式生成代码
    genNode(node.return, context)
}

function genStringLiteral(node, context) {
    const { push } = context
    // 对于字符串字面量，只需要追加与 node.value 对应的字符串即可
    push(`'${node.value}'`)
}

function genCallExpression(node, context) {
    const { push } = context
    // 取得被调用函数名称和参数列表
    const { callee, arguments: args } = node
    // 生成函数调用代码
    push(`${callee.name}(`)
    // 调用 genNodeList 生成参数代码
    genNodeList(args, context)
    // 补全括号
    push(`)`)
}

const ast = parse(`<div><p>Vue</p><p>Template</p></div>`)
transform(ast)
transformRoot(ast)
const code = generate(ast.jsNode)
console.log(code)

