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
            patchKeyedChildren(n1, n2, container)
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
     * @param {*} container 容器
     */
    function patchKeyedChildren(n1, n2, container) {
        const oldChildren = n1.children
        const newChildren = n2.children
        // 四个索引值
        let oldStartIdx = 0
        let oldEndIdx = oldChildren.length - 1
        let newStartIdx = 0
        let newEndIdx = newChildren.length - 1
        // 四个索引指向的 vnode 节点
        let oldStartVnode = oldChildren[oldStartIdx]
        let oldEndVnode = oldChildren[oldEndIdx]
        let newStartVnode = newChildren[newStartIdx]
        let newEndVnode = newChildren[newEndIdx]
        while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
            if (oldStartVnode.key === newStartVnode.key) {
                // 第一步：比较旧的一组子节点中的第一个子节点 p-1 与新的一组子节点中的第一个子节点 p-4，看看它们是否相同。
                // 发现两者 key 值相同，可以复用,但两者在新旧两组子节点中都是头部节点，因此不需要移动
                // 调用 patch 函数在 oldStartVnode 与 newStartVnode 之间打补丁
                patch(oldStartVnode, newStartVnode, container)
                // 更新相关索引，指向下一个位置
                oldStartVnode = oldChildren[++oldStartIdx]
                newStartVnode = newChildren[++newStartIdx]
            } else if (oldEndVnode.key === newEndVnode.key) {
                // 第二步：比较旧的一组子节点中的最后一个子节点 p-4 与新的一组子节点中的最后一个子节点 p-3，看看它们是否相同。
                // 两者的 key 值相同，可以复用。另外，由于两者都处于尾部，因此不需要对真实 DOM 进行移动操作，只需要打补丁即可
                // 节点在新的顺序中仍然处于尾部，不需要移动，但仍需打补丁
                patch(oldEndVnode, newEndVnode, container)
                // 更新索引和头尾部节点变量
                oldEndVnode = oldChildren[--oldEndIdx]
                newEndVnode = newChildren[--newEndIdx]
            } else if (oldStartVnode.key === newEndVnode.key) {
                // 第三步：比较旧的一组子节点中的第一个子节点 p-1 与新的一组子节点中的最后一个子节点 p-3，看看它们是否相同。
                // 两者的 key 值相同，可以复用
                // 说明节点 p-1原本是头部节点，但在新的顺序中，它变成了尾部节点
                // 我们需要将节点 p-1 对应的真实 DOM 移动到旧的一组子节点的尾部节点 p-2 所对应的真实 DOM 后面，同时还需要更新相应的索引到下一个位置，
                // 调用 patch 函数在 oldStartVnode 和 newEndVnode 之间打补丁
                patch(oldStartVnode, newEndVnode, container)
                // 将旧的一组子节点的头部节点对应的真实 DOM 节点 oldStartVnode.el 移动到旧的一组子节点的尾部节点对应的真实 DOM 节点后面
                insert(oldStartVnode.el, container, oldEndVnode.el.nextSibling)
                // 更新相关索引到下一个位置
                oldStartVnode = oldChildren[++oldStartIdx]
                newEndVnode = newChildren[--newEndIdx]
            } else if (oldEndVnode.key === newStartVnode.key) {
                // 第四步：比较旧的一组子节点中的最后一个子节点 p-4 与新的一组子节点中的第一个子节点 p-4。
                // key 值相同，因此可以进行 DOM 复用。
                // 说明：节点 p-4 原本是最后一个子节点，但在新的顺序中，它变成了第一个子节点。
                // 将索引 oldEndIdx 指向的虚拟节点所对应的真实 DOM 移动到索引 oldStartIdx 指向的虚拟节点所对应的真实DOM 前面。
                // 仍然需要调用 patch 函数进行打补丁
                patch(oldEndVnode, newStartVnode, container)
                // oldEndVnode.el 移动到 oldStartVnode.el 前面
                insert(oldEndVnode.el, container, oldStartVnode.el)
                // 移动 DOM 完成后，更新索引值，并指向下一个位置
                oldEndVnode = oldChildren[--oldEndIdx]
                newStartVnode = newChildren[++newStartIdx]
            }
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