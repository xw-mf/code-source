const VOID_TAGS =
    'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'.split(',')

function renderElementVNode(vnode) {
    // 取出标签名称 tag 和标签属性 props，以及标签的子节点
    const { type: tag, props, children } = vnode
    // 判断是否是 void element
    const isVoidElement = VOID_TAGS.includes(tag)

    // 开始标签的头部
    let ret = `<${tag}`
    // 处理标签属性
    if (props) {
        // 调用 renderAttrs 函数进行严谨处理
        ret += renderAttrs(props)
    }

    // 如果是 void element，则自闭合
    ret += isVoidElement ? `/>` : `>`
    // 如果是 void element，则直接返回结果，无须处理 children，因为 void element 没有 children
    if (isVoidElement) return ret

    // 处理子节点
    // 如果子节点的类型是字符串，则是文本内容，直接拼接
    if (typeof children === 'string') {
        ret += children
    } else if (Array.isArray(children)) {
        // 如果子节点的类型是数组，则递归地调用 renderElementVNode 完成渲染
        children.forEach(child => {
            ret += renderElementVNode(child)
        })
    }

    // 结束标签
    ret += `</${tag}>`

    // 返回拼接好的 HTML 字符串
    return ret
}

// 应该忽略的属性
const shouldIgnoreProp = ['key', 'ref']

function renderAttrs(props) {
    let ret = ''
    for (const key in props) {
        if (
            // 检测属性名称，如果是事件或应该被忽略的属性，则忽略它
            shouldIgnoreProp.includes(key) ||
            /^on[^a-z]/.test(key)
        ) {
            continue
        }
        const value = props[key]
        // 调用 renderDynamicAttr 完成属性的渲染
        ret += renderDynamicAttr(key, value)
    }
    return ret
}

// 用来判断属性是否是 boolean attribute
const isBooleanAttr = (key) =>
    (`itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidat
e,readonly` +
        `,async,autofocus,autoplay,controls,default,defer,disabled,hidden,`
        +
        `loop,open,required,reversed,scoped,seamless,` +
        `checked,muted,multiple,selected`).split(',').includes(key)

// 用来判断属性名称是否合法且安全
const isSSRSafeAttrName = (key) => !/[>/="'\u0009\u000a\u000c\u0020]/.test(key)

function renderDynamicAttr(key, value) {
    if (isBooleanAttr(key)) {
        // 对于 boolean attribute，如果值为 false，则什么都不需要渲染，否则只需要渲染 key 即可
        return value === false ? `` : ` ${key}`
    } else if (isSSRSafeAttrName(key)) {
        // 对于其他安全的属性，执行完整的渲染，
        // 注意：对于属性值，我们需要对它执行 HTML 转义操作
        return value === '' ? ` ${key}` : `${key}="${escapeHtml(value)}"`
    } else {
        // 跳过不安全的属性，并打印警告信息
        console.warn(`[@vue/server-renderer] Skipped rendering unsafe attributename: ${key}`)
        return ``
    }
}

const escapeRE = /["'&<>]/
function escapeHtml(string) {
    const str = '' + string
    const match = escapeRE.exec(str)

    if (!match) {
        return str
    }

    let html = ''
    let escaped
    let index
    let lastIndex = 0
    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34: // "
                escaped = '&quot;'
                break
            case 38: // &
                escaped = '&amp;'
                break
            case 39: // '
                escaped = '&#39;'
                break
            case 60: // <
                escaped = '&lt;'
                break
            case 62: // >
                escaped = '&gt;'
                break
            default:
                continue
        }

        if (lastIndex !== index) {
            html += str.substring(lastIndex, index)
        }

        lastIndex = index + 1
        html += escaped
    }

    return lastIndex !== index ? html + str.substring(lastIndex, index) : html
}

const ElementVNode = {
    type: 'div',
    props: {
        id: 'foo'
    },
    children: [
        { type: 'p', children: 'hello' }
    ]
}

console.log(renderElementVNode(ElementVNode))

function renderComponentVNode(vnode) {
    const isFunctional = typeof vnode.type === 'function'
    let componentOptions = vnode.type
    if (isFunctional) {
        componentOptions = {
            render: vnode.type,
            props: vnode.type.props
        }
    }
    let { render, data, setup, beforeCreate, created, props: propsOption } = componentOptions

    beforeCreate && beforeCreate()

    // 无须使用 reactive() 创建 data 的响应式版本
    const state = data ? data() : null
    const [props, attrs] = resolveProps(propsOption, vnode.props)

    const slots = vnode.children || {}

    const instance = {
        state,
        // props 无须 shallowReactive
        props,
        isMounted: false,
        subTree: null,
        slots,
        mounted: [],
        keepAliveCtx: null
    }

    function emit(event, ...payload) {
        const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
        const handler = instance.props[eventName]
        if (handler) {
            handler(...payload)
        } else {
            console.error('事件不存在')
        }
    }

    // setup
    let setupState = null
    if (setup) {
        const setupContext = { attrs, emit, slots }
        const prevInstance = setCurrentInstance(instance)
        const setupResult = setup(shallowReadonly(instance.props), setupContext)
        setCurrentInstance(prevInstance)
        if (typeof setupResult === 'function') {
            if (render) console.error('setup 函数返回渲染函数，render 选项将被忽略')
            render = setupResult
        } else {
            setupState = setupContext
        }
    }

    vnode.component = instance

    const renderContext = new Proxy(instance, {
        get(t, k, r) {
            const { state, props, slots } = t

            if (k === '$slots') return slots

            if (state && k in state) {
                return state[k]
            } else if (k in props) {
                return props[k]
            } else if (setupState && k in setupState) {
                return setupState[k]
            } else {
                console.error('不存在')
            }
        },
        set(t, k, v, r) {
            const { state, props } = t
            if (state && k in state) {
                state[k] = v
            } else if (k in props) {
                props[k] = v
            } else if (setupState && k in setupState) {
                setupState[k] = v
            } else {
                console.error('不存在')
            }
        }
    })

    created && created.call(renderContext)

    const subTree = render.call(renderContext, renderContext)

    return renderVNode(subTree)
}

function renderVNode(vnode) {
    const type = typeof vnode.type
    if (type === 'string') {
        return renderElementVNode(vnode)
    } else if (type === 'object' || type === 'function') {
        return renderComponentVNode(vnode)
    } else if (vnode.type === Text) {
        // 处理文本...
    } else if (vnode.type === Fragment) {
        // 处理片段...
    } else {
        // 其他 VNode 类型
    }
}