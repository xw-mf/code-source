function createRenderer(options) {
    const { 
        createElement,
        setElementText,
        insert
     } = options
    function render(vnode, container) {
        // 如果有新的 vnode
        if (vnode) {
            // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
            patch(container._vnode, vnode, container)
        } else {
            // 旧 vnode 存在，且新 vnode 不存在，说明是卸载（unmount）操作
            // 只需要将 container 内的 DOM 清空即可
            if (container._vnode) {
                // 说明是卸载
                container.innerHTML = ''
            }
        }
        // 把 vnode 存储到 container._vnode 下，即后续渲染中的旧 vnode
        container._vnode = vnode
    }
    
    /**
     * 
     * @param {*} n1 旧 vnode
     * @param {*} n2 新vnode
     * @param {*} container 容器
     */
    function patch(n1, n2, container) {
        // 如果 n1 不存在，意味着挂载，则调用 mountElement 函数完成挂载
        if (!n1) {
            mountElement(n2, container)
        } else {}
    }

    /**
     * 
     * @param {*} vnode 新的 vnode
     * @param {*} container 容器
     */
    function mountElement(vnode, container) {
        // 创建 DOM 元素
        const el = createElement(vnode.type)
        // 处理子节点，如果子节点是字符串，代表元素具有文本节点
        if (typeof vnode.children === 'string') {
            // 调用 setElementText 设置元素的文本节点
            setElementText(el, vnode.children)
        }
        // 调用 insert 函数将元素插入到容器内
        insert(el, container)
    }

    return {
        render
    }
}

// 在创建 renderer 时传入配置项
const renderer = createRenderer({
    // 用于创建元素
    createElement(tag) {
        return document.createElement(tag)
    },
    // 用于设置元素的文本节点
    setElementText(el, content) {
        el.textContent = content
    },
    // 用于在给定的 parent 下添加指定元素
    insert(el, parent, anchor = null) {
        parent.insertBefore(el, anchor)
    }
})

const customRenderer = createRenderer({
    // 用于创建元素
    createElement(tag) {
        console.log(`创建元素 ${tag}`)
        return {
            tag
        }
    },
    // 用于设置元素的文本节点
    setElementText(el, content) {
        console.log(`设置 ${JSON.stringify(el)} 的文本内容：${content}`)
        el.textContent = content
    },
    // 用于在给定的 parent 下添加指定元素
    insert(el, parent, anchor = null) {
        console.log(`将 ${JSON.stringify(el)} 添加到 ${JSON.stringify(parent)} 下`)
        parent.children = el
    }
})

const vnode = {
    type: 'h1',
    children: 'hello'
}
// 使用一个对象模拟挂载点
const container = { type: 'root' }
customRenderer.render(vnode, container)