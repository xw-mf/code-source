function createRenderer(options) {
    function hydrate(node, vnode) {
        // ...
    }

    return {
        render,
        // 作为 createRenderer 函数的返回值
        hydrate
    }
}

function hydrate(vnode, container) {
    // 从容器元素的第一个子节点开始
    hydrateNode(container.firstChild, vnode)
}

function hydrateNode(node, vnode) {
    const { type } = vnode
    // 1. 让 vnode.el 引用真实 DOM
    vnode.el = node

    // 2. 检查虚拟 DOM 的类型，如果是组件，则调用 mountComponent 函数完成激活
    if (typeof type === 'object') {
        mountComponent(vnode, container, null)
    } else if (typeof type === 'string') {
        // 3. 检查真实 DOM 的类型与虚拟 DOM 的类型是否匹配
        if (node.nodeType !== 1) {
            console.error('mismatch')
            console.error('服务端渲染的真实 DOM 节点是：', node)
            console.error('客户端渲染的虚拟 DOM 节点是：', vnode)
        } else {
            // 4. 如果是普通元素，则调用 hydrateElement 完成激活
            hydrateElement(node, vnode)
        }
    }

    // 5. 重要：hydrateNode 函数需要返回当前节点的下一个兄弟节点，以便继续进行后续的激活操作
    return node.nextSibling
}