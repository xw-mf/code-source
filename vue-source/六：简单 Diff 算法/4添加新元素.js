function createRenderer(options) {
    const {
        createElement,
        setElementText,
        insert,
        createText,
        setText,
        patchProps
    } = options

    // 文本节点的类型
    const Text = Symbol()
    // 注释节点的类型
    const Comment = Symbol()
    // Fragment 节点
    const Fragment = Symbol()

    function render(vnode, container) {
        // 如果有新的 vnode
        if (vnode) {
            // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
            patch(container._vnode, vnode, container)
        } else {
            // 旧 vnode 存在，且新 vnode 不存在，说明是卸载（unmount）操作
            // 只需要将 container 内的 DOM 清空即可
            if (container._vnode) {
                // 调用 unmount 函数卸载 vnode
                unmount(container._vnode)
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
    function patch(n1, n2, container, anchor) {
        // 如果 n1 存在，则对比 n1 和 n2 的类型
        if (n1 && n1.type !== n2.type) {
            // 如果新旧 vnode 的类型不同，则直接将旧 vnode 卸载
            unmount(n1)
            n1 = null
        }
        const { type } = n2
        if (typeof type === 'string') {
            if (!n1) {
                mountElement(n2, container, anchor)
            } else {
                patchElement(n1, n2)
            }
        } else if (type === Text) {
            // 如果新 vnode 的类型是 Text，则说明该 vnode 描述的是文本节点
            // 如果没有旧节点，则进行挂载
            if (!n1) {
                // 使用 createTextNode 创建文本节点
                const el = n2.el = createText(n2.children)
                // 将文本节点插入到容器中
                insert(el, container)
            } else {
                // 如果旧 vnode 存在，只需要使用新文本节点的文本内容更新旧文本节点即可
                const el = n2.el = n1.el
                if (n2.children !== n1.children) {
                    setText(el, n2.children)
                }
            }
        } else if (type === Fragment) {
            // 处理 Fragment 类型的 vnode
            if (!n1) {
                // 如果旧 vnode 不存在，则只需要将 Fragment 的 children 逐个挂载即可
                n2.children.forEach(c => patch(null, c, container))
            } else {
                // 如果旧 vnode 存在，则只需要更新 Fragment 的 children 即可
                patchChildren(n1, n2, container)
            }
        }
    }

    /**
     * 
     * @param {*} n1 旧 vnode
     * @param {*} n2 新 vnode
     * @param {*} container 容器
     */
    function patchChildren(n1, n2, container) {
        // 判断子节点是否是文本节点
        if (typeof n2.children === 'string') {
            // 旧子节点的类型有三种可能：没有子节点、文本子节点以及一组子节点
            // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要做
            if (Array.isArray(n1.children)) {
                n1.children.forEach(c => unmount(c))
            }
            // 最后将新的文本节点内容设置给容器元素
            setElementText(container, n2.children)
        } else if (Array.isArray(n2.children)) {
            if (Array.isArray(n1.children)) {
                // 新旧节点的 children 都为一组子节点 进行关键的 diff 算法
                // 新旧 children
                const oldChildren = n1.children
                const newChildren = n2.children
                // 旧的一组子节点的长度
                const oldChildrenLength = oldChildren.length
                // 新的一组子节点的长度
                const newChildrenLength = newChildren.length
                // 用来存储寻找过程中遇到的最大索引值
                let lastIndex = 0
                for (let i = 0; i < newChildrenLength; i++) {
                    // 在第一层循环中定义变量 find，代表是否在旧的一组子节点中找到可复用的节点
                    // 初始值为 false，代表没找到
                    let find = false
                    const newVnode = newChildren[i];
                    for (let j = 0; j < oldChildrenLength; j++) {
                        const oldVnode = oldChildren[j];
                        // 如果找到了具有相同 key 值的两个节点，说明可以复用，但仍然需要调用 patch 函数更新
                        if (newVnode.key === oldVnode.key) {
                            // 一旦找到可复用的节点，则将变量 find 的值设为 true
                            find = true
                            patch(oldVnode, newVnode, container)
                            if (j < lastIndex) {
                                // 如果当前找到的节点在旧 children 中的索引小于最大索引值lastIndex
                                // 说明该节点对应的真实 DOM 需要移动
                                // 代码运行到这里，说明 newVNode 对应的真实 DOM 需要移动
                                // 先获取 newVNode 的前一个 vnode，即 prevVNode
                                const prevVNode = newChildren[i - 1]
                                // 如果 prevVNode 不存在，则说明当前 newVNode 是第一个节点，它不需要移动
                                if (prevVNode) {
                                    // 由于我们要将 newVNode 对应的真实 DOM 移动到 prevVNode 所对应真实 DOM 后面，所以我们需要获取 prevVNode 所对应真实 DOM 的下一个兄弟节点，并将其作为锚点
                                    const anchor = prevVNode.el.nextSibling
                                    // 调用 insert 方法将 newVNode 对应的真实 DOM 插入到锚点元素前面
                                    // 也就是 prevVNode 对应真实 DOM 的后面
                                    insert(newVnode.el, container, anchor)
                                }
                            } else {
                                // 如果当前找到的节点在旧 children 中的索引不小于最大索引值，则更新 lastIndex 的值
                                lastIndex = j
                            }
                            break
                        }
                    }
                    // 如果代码运行到这里，find 仍然为 false，
                    // 说明当前 newVNode 没有在旧的一组子节点中找到可复用的节点
                    // 也就是说，当前 newVNode 是新增节点，需要挂载
                    if (!find) {
                        // 为了将节点挂载到正确位置，我们需要先获取锚点元素
                        // 首先获取当前 newVNode 的前一个 vnode 节点
                        const prevVNode = newChildren[i - 1]
                        let anchor = null
                        if (prevVNode) {
                            // 如果有前一个 vnode 节点，则使用它的下一个兄弟节点作为锚点元素
                            anchor = prevVNode.el.nextSibling
                        } else {
                            // 如果没有前一个 vnode 节点，说明即将挂载的新节点是第一个子节
                            // 这时我们使用容器元素的 firstChild 作为锚点
                            anchor = container.firstChild
                        }
                        patch(null, newVnode, container, anchor)
                    }
                }
            } else {
                // 旧子节点要么是文本子节点，要么不存在
                // 但无论哪种情况，我们都只需要将容器清空，然后将新的一组子节点逐个挂载
                setElementText(container, '')
                n2.children.forEach(c => patch(null, c, container))
            }
        } else {
            // 代码运行到这里，说明新子节点不存在
            // 旧子节点是一组子节点，只需逐个卸载即可
            if (Array.isArray(n1.children)) {
                n1.children.forEach(c => unmount(c))
            } else if (typeof n1.children === 'string') {
                // 旧子节点是文本子节点，清空内容即可
                setElementText(container, '')
            }
            // 如果也没有旧子节点，那么什么都不需要做
        }
    }

    /**
     * 
     * @param {*} n1 旧 vnode
     * @param {*} n2 新 vnode
     */
    function patchElement(n1, n2) {
        const el = n2.el = n1.el
        const oldProps = n1.props
        const newProps = n2.props
        // 第一步: 更新 props
        for (const key in newProps) {
            if (newProps[key] !== oldProps[key]) {
                patchProps(el, key, oldProps[key, newProps[key]])
            }
        }
        for (const key in oldProps) {
            if (!(key in newProps)) {
                patchProps(el, key, oldProps[key], null)
            }
        }

        // 第二步: 更新 children
        patchChildren(n1, n2, el)

    }

    /**
    * 
    * @param {*} vnode 
    */
    function unmount(vnode) {
        // 在卸载时，如果卸载的 vnode 类型为 Fragment，则需要卸载其 children
        if (vnode.type === Fragment) {
            vnode.children.forEach(c => unmount(c))
            return
        }
        // 根据 vnode 获取要卸载的真实 DOM 元素
        const el = vnode.el
        // 获取 el 的父元素
        const parent = el.parentNode
        // 调用 removeChild 移除元素
        if (parent) parent.removeChild(el)
    }

    /**
     * 
     * @param {*} vnode 新的 vnode
     * @param {*} container 容器
     * @param {*} anchor 锚点
     */
    function mountElement(vnode, container, anchor) {
        // 创建 DOM 元素
        const el = vnode.el = createElement(vnode.type)
        // 处理子节点，如果子节点是字符串，代表元素具有文本节点
        if (typeof vnode.children === 'string') {
            // 调用 setElementText 设置元素的文本节点
            setElementText(el, vnode.children)
        } else if (Array.isArray(vnode.children)) {
            // 如果 children 是数组，则遍历每一个子节点，并调用 patch 函数挂载它们
            vnode.children.forEach(child => {
                patch(null, child, el)
            })
        }

        if (vnode.props) {
            for (const key in vnode.props) {
                // 调用 patchProps 函数即可
                patchProps(el, key, null, vnode.props[key])
            }
        }
        // 调用 insert 函数将元素插入到容器内
        // 在插入节点时，将锚点元素透传给 insert 函数
        insert(el, container, anchor)
    }

    return {
        render
    }
}

/**
 * 
 * @param {*} el 
 * @param {*} key 
 * @param {*} value 
 * @returns 
 */
function shouldSetAsProps(el, key, value) {
    if (key === 'form' && el.tagName === 'INPUT') return false
    return key in el
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
        // parent.appendChild(el)
    },
    createText(text) {
        return document.createTextNode(text)
    },
    setText(el, text) {
        el.nodeValue = text
    },
    // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
    patchProps(el, key, prevValue, nextValue) {
        // 1. 先从 el._vei 中读取对应的 invoker，如果 invoker 不存在，则将伪造的 invoker 作为事件处理函数，并将它缓存到 el._vei 属性中。
        // 2. 把真正的事件处理函数赋值给 invoker.value 属性，然后把伪造的 invoker 函数作为事件处理函数绑定到元素上。可以看到，当事件触发时，实际上执行的是伪造的事件处理函数，在其内部间接执行了真正的事件处理函数 invoker.value(e)
        if (/^on/.test(key)) {
            // 定义 el._vei 为一个对象，存在事件名称到事件处理函数的映射
            const invokers = el._vei || (el._vei = {})
            // 获取为该元素伪造的事件处理函数 invoker
            let invoker = invokers[key]
            // 获取事件名
            const name = key.slice(2).toLowerCase()
            if (nextValue) {
                // 如果没有 invoker，则将一个伪造的 invoker 缓存到 el._vei 中
                if (!invoker) {
                    // 将事件处理函数缓存到 el._vei[key] 下，避免覆盖
                    invoker = el._vei[key] = (e) => {
                        // 如果事件发生的时间早于事件处理函数绑定的时间，则不执行事件处理函数
                        if (e.timeStamp < invoker.attached) return
                        // 如果 invoker.value 是数组，则遍历它并逐个调用事件处理函数
                        if (Array.isArray(invoker.value)) {
                            invoker.value.forEach(fn => fn(e))
                        } else {
                            // 否则直接作为函数调用
                            invoker.value(e)
                        }
                    }
                    // 将真正的事件处理函数赋值给 invoker.value
                    invoker.value = nextValue
                    // 添加 invoker.attached 属性，存储事件处理函数被绑定的时间
                    invoker.attached = performance.now()
                    // 绑定 invoker 作为事件处理函数
                    el.addEventListener(name, invoker)
                } else {
                    // // 如果 invoker 存在，意味着更新，并且只需要更新 invoker.value的值即可
                    invoker.value = nextValue
                }
            } else if (invoker) {
                // 新的事件绑定函数不存在，且之前绑定的 invoker 存在，则移除绑定
                el.removeEventListener(name, invoker)
            }
        } else if (key === 'class') {
            el.className = nextValue
        } else if (shouldSetAsProps(el, key, nextValue)) {
            // 获取该 DOM Properties 的类型
            const type = typeof el[key]
            // 如果是布尔类型，并且 value 是空字符串，则将值矫正为 true
            if (type === 'boolean' && nextValue === '') {
                el[key] = true
            } else {
                el[key] = nextValue
            }
        } else {
            // 如果要设置的属性没有对应的 DOM Properties，则使用 setAttribute 函数设置属性
            el.setAttribute(key, nextValue)
        }
    },
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

function normalizeClassName(classes, key = '') {
    function normalizeClass(classes, key = '') {
        let resClassStr = ''
        if (typeof classes === 'string') {
            resClassStr += `${classes} `
        } else if (typeof classes === 'boolean' && !!classes && !!key) {
            resClassStr += `${key} `
        } else if (Array.isArray(classes)) {
            for (let i = 0; i < classes.length; i++) {
                resClassStr += `${normalizeClass(classes[i])}`
            }
        } else if (typeof classes === 'object' && classes !== null) {
            for (const k in classes) {
                if (Object.hasOwnProperty.call(classes, k)) {
                    resClassStr += `${normalizeClass(classes[k], k)}`
                }
            }
        }

        return resClassStr
    }
    let normalizeClassStr = normalizeClass(classes, key = '')
    return normalizeClassStr.trim()
}

const { effect, ref } = VueReactivity

const oldVNode = {
    type: 'div',
    children: [
        { type: 'p', children: '1', key: 1 },
        { type: 'p', children: '2', key: 2 },
        { type: 'p', children: 'hello', key: 3 }
    ]
}

const newVNode = {
    type: 'div',
    children: [
        { type: 'p', children: 'world', key: 3 },
        { type: 'p', children: '1', key: 1 },
        { type: 'p', children: '4', key: 4 },
        { type: 'p', children: '2', key: 2 }
    ]
}
// 首次挂载
renderer.render(oldVNode, document.querySelector('#app'))
setTimeout(() => {
    // 1 秒钟后更新
    renderer.render(newVNode, document.querySelector('#app'))
}, 1000);