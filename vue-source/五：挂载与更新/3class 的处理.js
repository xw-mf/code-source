function createRenderer(options) {
    const { 
        createElement,
        setElementText,
        insert,
        patchProps
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
        insert(el, container)
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
    insert(el, parent) {
        parent.appendChild(el)
    },
    // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
    patchProps(el, key, prevValue, nextValue) {
        if (key === 'class') {
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

const vnode = {
    type: 'h1',
    props: {
        id: 'foo'
    },
    children: [
        {
            type: 'p',
            children: 'hello'
        },
        {
            type: 'button',
            props: {
                disabled: ''
            },
            children: '禁用的 button'
        },
    ]
}
// 使用一个对象模拟挂载点
const container = document.getElementById('app')
renderer.render(vnode, container)

console.log(normalizeClassName({
    foo: [
        'foo',
        { baz: true },
        [
            'x y',
            {
                z: true,
                w: false
            }
        ]
    ],
    bar: false 
}))