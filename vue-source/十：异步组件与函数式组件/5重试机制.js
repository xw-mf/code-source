const { effect, ref, reactive, shallowReactive, shallowReadonly } = VueReactivity

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
        } else if (typeof type === 'object') {
            // 如果新 vnode 的类型是一个对象，则说明该 vnode 描述的是一个组件    
            if (!n1) {
                // 挂载组件
                mountComponent(n2, container, anchor)
            } else {
                // 更新组件
                patchComponent(n1, n2, anchor)
            }
        }
    }

    // 任务缓存队列，用一个 Set 数据结构来表示，这样就可以自动对任务进行去重
    const queue = new Set()
    // 一个标志，代表是否正在刷新任务队列
    let isFlushing = false
    // 创建一个立即 resolve 的 Promise 实例
    const p = Promise.resolve()

    // 调度器的主要函数，用来将一个任务添加到缓冲队列中，并开始刷新队列
    function queueJob(job) {
        // 将 job 添加到任务队列 queue 中
        queue.add(job)
        // 如果还没有开始刷新队列，则刷新之
        if (!isFlushing) {
            // 将该标志设置为 true 以避免重复刷新
            isFlushing = true
            // 在微任务中刷新缓冲队列
            p.then(() => {
                try {
                    // 执行任务队列中的任务
                    queue.forEach(job => job())
                } finally {
                    // 重置状态
                    isFlushing = false
                    queue.clear = 0
                }
            })
        }
    }

    // // 用来描述组件的 VNode 对象，type 属性值为组件的选项对象
    // const CompVNode = {
    //     type: MyComponent
    // }
    // // 调用渲染器来渲染组件
    // renderer.render(CompVNode, document.querySelector('#app'))

    /**
     *
     * @param {*} vnode 新 vnode
     * @param {*} container 容器
     * @param {*} anchor 锚点
     */
    function mountComponent(vnode, container, anchor) {
        // 通过 vnode 获取组件的选项对象，即 vnode.type
        const componentOptions = vnode.type
        // 从组件选项对象中取得组件的生命周期函数
        const {
            render,
            data,
            setup,
            props: propsOptions,
            beforeCreate,
            created,
            beforeMount,
            beforeUpdate,
            updated 
        } = componentOptions
        // 在这里调用 beforeCreate 钩子
        beforeCreate && beforeCreate()
        // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
        const state = reactive(data())
        // 调用 resolveProps 函数解析出最终的 props 数据与 attrs 数据
        const [ props, attrs ] = resolveProps(propsOptions, vnode.props)
        // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
        const instance = {
            // 组件自身的状态数据，即 data
            state,
            // 将解析出的 props 数据包装为 shallowReactive 并定义到组件实例上
            props: shallowReactive(props),
            // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
            isMounted: false,
            // 组件所渲染的内容，即子树（subTree）
            subTree: null,
            // 将插槽添加到组件实例上
            slots,
            // 在组件实例中添加 mounted 数组，用来存储通过 onMounted 函数注册的生命周期钩子函数
            mounted: []
        }
        // 定义 emit 函数，它接收两个参数
        // event: 事件名称
        // payload: 传递给事件处理函数的参数
        function emit(event, ...payload) {
            // 根据约定对事件名称进行处理，例如 change --> onChange
            const eventName = `on${event[0].toUpperCase()}${event.slice(1)}`
            // 根据处理后的事件名称去 props 中寻找对应的事件处理函数
            const handler = instance.props[eventName]
            if (handler) {
                handler(...payload)
            } else {
                console.warn(`组件实例上不存在名为 ${eventName} 的事件处理函数`)
            }
        }
        // 直接使用编译好的 vnode.children 对象作为 slots 对象即可
        const slots = vnode.children
        const setupContext = {
            attrs,
            // 将 emit 函数添加到 setupContext 中，用户可以通过 setupContext 取得 emit 函数
            emit,
            // 将 slots 对象添加到 setupContext 中
            slots
        }
        // 在调用 setup 函数之前，设置当前组件实例
        setCurrentInstance(instance)
        // 调用 setup 函数，将只读版本的 props 作为第一个参数传递，避免用户意外地修改 props 的值
        // 将 setupContext 作为第二个参数传递
        const setupResult = setup(shallowReadonly(instance.props), setupContext)
        // 在 setup 函数执行完毕之后，重置当前组件实例
        setCurrentInstance(null)
        // setupState 用来存储由 setup 返回的数据
        let setupState = null
        // 如果 setup 函数的返回值是函数，则将其作为渲染函数
        if (typeof setupResult === 'function') {
            if (render) console.error('setup 函数返回渲染函数，render 选项将被忽略')
            // 将 setupResult 作为渲染函数
            render = setupResult
        } else {
            // 如果 setup 函数的返回值不是函数，则作为数据状态赋值给 setupState
            setupState = setupResult
        }
        // 将组件实例设置到 vnode 上，用于后续更新
        vnode.component = instance
        // 创建渲染上下文对象，本质上是组件实例的代理
        const renderContext = new Proxy(instance, {
            get(target, key, receiver) {
                // 取得组件自身状态与 props 数据
                const { state, props, slots } = target
                // 当 k 的值为 $slots 时，直接返回组件实例上的 slots
                if (k === '$slots') return slots
                // 先尝试读取自身状态数据
                if (state && key in state) {
                    return state[key]    
                } else if (key in props) {
                    // 如果组件自身没有该数据，则尝试从 props 中读取
                    return props[key]
                } else if (setupState && key in setupState) {
                    // 渲染上下文需要增加对 setupState 的支持
                    return setupState[key]
                } else {
                    console.error('不存在')
                } 
            },
            set(target, key, value, receiver) {
                const { state, props } = target
                // 先尝试设置自身状态数据
                if (state && key in state) {
                    state[key] = value
                } else if (key in props) {
                    console.warn(`Attempting to mutate prop "${k}". Props are readonly.`)
                } else if (setupState && key in setupState) {
                    // 渲染上下文需要增加对 setupState 的支持
                    setupState[k] = v
                } else {
                    console.error('不存在')
                }
            }
        })
        // 生命周期函数调用时要绑定渲染上下文对象
        created && created.call(renderContext)
        // 当组件自身状态发生变化时，我们需要有能力触发组件更新，即
        // 组件的自更新。为此，我们需要将整个渲染任务包装到一个 effect 中
        effect(() => {
            // 调用 render 函数时，将其 this 设置为 state
            // 从而 render 函数内部可以通过 this 访问组件自身状态数据
            // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的虚拟 DOM
            const subTree = render.call(renderContext, renderContext)
            // 检查组件是否已经被挂载
            if (!instance.isMounted) {
                // 在这里调用 beforeMount 钩子
                beforeMount && beforeMount.call(renderContext)
                // 初次挂载，调用 patch 函数第一个参数传递 null
                patch(null, subTree, container, anchor)
                // 将组件实例的 isMounted 属性设置为 true，这样当更新发生时就不会再次进行挂载操作
                instance.isMounted = true
                // 遍历 instance.mounted 数组并逐个执行即可
                instance.mounted && instance.mounted.forEach(fn => fn.call(renderContext))
            } else {
                // 在这里调用 beforeUpdate 钩子
                beforeUpdate && beforeUpdate.call(renderContext)
                // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可
                // 所以在调用 patch 函数时，第一个参数为组件上一次渲染的子树
                // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
                patch(instance.subTree, subTree, container, anchor)
                // 在这里调用 updated 钩子
                updated && updated.call(renderContext)
            }
            // 更新组件实例的子树
            instance.subTree = subTree
        }, {
            scheduler: queueJob
        })
    }

    // 对于除 mounted 以外的生命周期钩子函数，其原理同上。
    function onMounted(fn) {
        if (currentInstance) {
            // 将生命周期函数添加到 instance.mounted 数组中
            currentInstance.mounted.push(fn)
        } else {
            console.error('onMounted 函数只能在 setup 中调用')
        }
    }

    // resolveProps 函数用于解析组件 props 和 attrs 数据
    function resolveProps(options, propsData) {
        const props = {}
        const attrs = {}
        // 遍历为组件传递的 props 数据
        for (const key in propsData) {
            // 以字符串 on 开头的 props，无论是否显式地声明，都将其添加到 props 数据中，而不是添加到 attrs 中
            if (key in options || key.startsWith('on')) {
                // 如果为组件传递的 props 数据在组件自身的 props 选项中有定义，则将其视为合法的 props
                props[key] = propsData[key]
            } else {
                // 否则将其视为 attrs
                attrs[key] = propsData[key]
            }
        }

        // 最后返回 props 与 attrs 数据
        return [ props, attrs ]
    }

    /**
     *
     * @param {*} n1 旧 vnode
     * @param {*} n2 新 vnode
     * @param {*} anchor 锚点
     */
    function patchComponent(n1, n2, anchor) {
        // 获取组件实例，即 n1.component，同时让新的组件虚拟节点 n2.component也指向组件实例
        const instance = (n2.component = n1.component)
        // 获取当前的 props 数据
        const { props } = instance
        // 调用 hasPropsChanged 检测为子组件传递的 props 是否发生变化，如果没有变化，则不需要更新
        if (hasPropsChanged(n1.props, n2.props)) {
            // 调用 resolveProps 函数重新获取 props 数据
            const [ nextProps ] = resolveProps(n2.type.props, n2.props)
            // 更新 props
            for (const key in nextProps) {
                props[key] = nextProps[key]
            }
            // 删除不存在的 props
            for (const key in props) {
                if (!(key in nextProps)) delete props[key]
            }
        }
    }

    /**
     *
     * @param {*} prevProps 旧 props
     * @param {*} nextProps 新 props
     */
    function hasPropsChanged(prevProps, nextProps) {
        const nextKeys = Object.keys(nextProps)
        // 如果新旧 props 的数量变了，则说明有变化
        if (nextKeys.length !== Object.keys(prevProps).length) {
            return true    
        }
        for (let i = 0; i < nextKeys.length; i++) {
            const key = nextKeys[i];
            // 有不相等的 props，则说明有变化
            if (nextProps[key] !== prevProps[key]) return true
        }
        return false
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

    function getSequence(arr) {
        const p = arr.slice()
        const result = [0]
        let i, j, u, v, c
        const len = arr.length
        for (i = 0; i < len; i++) {
            const arrI = arr[i]
            if (arrI !== 0) {
                j = result[result.length - 1]
                if (arr[j] < arrI) {
                    p[i] = j
                    result.push(i)
                    continue
                }
                u = 0
                v = result.length - 1
                while (u < v) {
                    c = ((u + v) / 2) | 0
                    if (arr[result[c]] < arrI) {
                        u = c + 1
                    } else {
                        v = c
                    }
                }
                if (arrI < arr[result[u]]) {
                    if (u > 0) {
                        p[i] = result[u - 1]
                    }
                    result[u] = i
                }
            }
        }
        u = result.length
        v = result[u - 1]
        while (u-- > 0) {
            result[u] = v
            v = p[v]
        }
        return result
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
        // 更新相同的前置节点
        // 索引 j 指向新旧两组子节点的开头
        let j = 0
        let oldVNode = oldChildren[j]
        let newVNode = newChildren[j]
        // while 循环向后遍历，直到遇到拥有不同 key 值的节点为止
        while (oldVNode.key === newVNode.key) {
            // 调用 patch 函数进行更新
            patch(oldVNode, newVNode, container)
            // 更新索引 j，让其递增
            j++
            oldVNode = oldChildren[j]
            newVNode = newChildren[j]
        }
        // 更新相同的后置节点
        // 索引 i 指向旧 vnode 的末尾，索引 k 指向新 vnode 的末尾
        let oldEnd = oldChildren.length - 1
        let newEnd = newChildren.length - 1
        oldVNode = oldChildren[oldEnd]
        newVNode = newChildren[newEnd]
        // while 循环从后向前遍历，直到遇到拥有不同 key 值的节点为止
        while (oldVNode.key === newVNode.key) {
            // 调用 patch 函数进行更新
            patch(oldVNode, newVNode, container)
            // 更新索引 oldEnd 和 newEnd，让其递减
            oldEnd--
            newEnd--
            oldVNode = oldChildren[oldEnd]
            newVNode = newChildren[newEnd]
        }
        // 预处理完毕后，如果满足如下条件，则说明从 j --> newEnd 之间的节点应作为新节点插入
        if (j > oldEnd && j <= newEnd) {
            // 锚点的索引
            const anchorIndex = newEnd + 1
            // 锚点元素
            const anchor = anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null
            // 采用 while 循环，调用 patch 函数逐个挂载新增节点
            while (j <= newEnd) {
                patch(null, newChildren[j++], container, anchor)
            }
        } else if (j > newEnd && j <= oldEnd) {
            // j -> oldEnd 之间的节点应该被卸载
            while (j <= oldEnd) {
                unmount(oldChildren[j++])
            }
        } else {
            // 构造 sources 数组
            // sources 数组将用来存储新的一组子节点中的节点在旧的一组子节点中的位置索引，后面将会使用它计算出一个最长递增子序列，并用于辅助完成 DOM 移动的操作
            // 新的一组子节点中剩余未处理节点的数量
            const count = newEnd - j + 1
            // 构造 sources 数组
            const sources = new Array(count)
            // 为 sources 数组填充新的一组子节点
            sources.fill(-1)
            // oldStart 和 newStart 分别为起始索引，即 j
            const oldStart = j
            const newStart = j
            // 新增两个变量，moved 和 pos
            let moved = false
            let pos = 0
            // 遍历旧的一组子节点
            // 这段代码中我们采用了两层嵌套的循环，
            // 其时间复杂度为 O(n1 * n2)，其中 n1 和 n2 为新旧两组子节点的数
            // 量，我们也可以使用 O(n^2) 来表示。当新旧两组子节点的数量较多
            // 时，两层嵌套的循环会带来性能问题。出于优化的目的，我们可以为
            // 新的一组子节点构建一张索引表，用来存储节点的 key 和节点位置索
            // 引之间的映射
            // for (let i = oldStart; i < oldEnd; i++) {
            //     const oldVnoe = oldChildren[i];
            //     // 遍历新的一组子节点
            //     for (let k = newStart; k < newEnd; k++) {
            //         const newVNode = newChildren[k];
            //         // 找到拥有相同 key 值的可复用节点
            //         if (oldVnoe.key === newVNode.key) {
            //             // 调用 patch 进行更新
            //             patch(oldVnoe, newVNode, container)
            //             // 最后填充 sources 数组
            //             sources[k - newStart] = i
            //         }
            //     }
            // }
            // 构建索引表
            const keyIndex = {}
            for (let i = newStart; i <= newEnd; i++) {
                // 为新的一组子节点构建索引表
                keyIndex[newChildren[i].key] = i
            }
            // 新增 patched 变量，代表更新过的节点数量
            let patched = 0
            // 遍历旧的一组子节点中剩余未处理的节点
            for (let i = oldStart; i <= oldEnd; i++) {
                oldVNode = oldChildren[i]
                // 如果更新过的节点数量小于等于需要更新的节点数量，则执行更新
                if (patched <= count) {
                    // 通过索引表快速找到新的一组子节点中具有相同 key 值的节点位置
                    const k = keyIndex[oldVNode.key]
                    // 如果 k 是 undefined，说明该节点不存在于新的一组子节点中，需要卸载
                    if (typeof k !== 'undefined') {
                        // 调用 patch 进行更新
                        patch(oldVNode, newChildren[k], container)
                        // 每更新一个节点，都将 patched 变量 +1
                        patched++
                        // 最后填充 sources 数组
                        sources[k - newStart] = i
                        // 判断节点是否需要移动
                        if (k < pos) {
                            moved = true
                        } else {
                            pos = k
                        }
                    } else {
                        unmount(oldVNode)
                    }
                } else {
                    // 如果更新过的节点数量大于需要更新的节点数量，则卸载多余的节点
                    unmount(oldVNode)
                }
            }
            if (moved) {
                // 如果 moved 为真，则需要进行 DOM 移动操作
                // 计算最长递增子序列
                const seq = getSequence(sources)
                // s 指向最长递增子序列的最后一个元素
                let s = seq.length - 1
                // i 指向新的一组子节点的最后一个元素
                let i = count - 1
                // for 循环使得 i 递减
                for (i; i >= 0; i--) {
                    if (sources[i] === -1) {
                        // 说明索引为 i 的节点是全新的节点，应该将其挂载
                        // 该节点在新 children 中的真实位置索引
                        const pos = i + newStart
                        const newVNode = newChildren[pos]
                        // 该节点的下一个节点的位置索引
                        const nextPos = pos + 1
                        // 锚点
                        const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null
                        // 挂载节点
                        patch(null, newVNode, container, anchor)
                    } else if (i !== seq[s]) {
                        // 如果当前索引 i 不在最长递增子序列中，则需要移动节点
                        // 该节点在新的一组子节点中的真实位置索引
                        const pos = i + newStart
                        const newVNode = newChildren[pos]
                        // 该节点在新的一组子节点中的下一个节点的真实位置索引
                        const nextPos = pos + 1
                        // 锚点
                        const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null
                        // 移动节点
                        insert(newVNode.el, container, anchor)
                    } else {
                        // 如果当前索引 i 在最长递增子序列中，则不需要移动节点
                        s--
                    }
                }
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
        } else if (typeof vnode.type === 'object') {
            // 对于组件的卸载，本质上是要卸载组件所渲染的内容，即 subTree
            unmount(vnode.component.subTree)
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

// 全局变量，存储当前正在被初始化的组件实例
let currentInstance = null
// 该方法接收组件实例作为参数，并将该实例设置为 currentInstance
function setCurrentInstance(instance) {
    currentInstance = instance
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
// defineAsyncComponent 函数用于定义一个异步组件，接收一个异步组件加载器作为参数
function defineAsyncComponent(options) {
    // options 可以是配置项，也可以是加载器
    if (typeof options === 'function') {
        // 如果 options 是加载器，则将其格式化为配置项形式
        options = {
            loader: options
        }
    }
    const { loader } = options
    // 一个变量，用来存储异步加载的组件
    let InnerComp = null
    // 记录重试次数
    let retries = 0
    // 封装 load 函数用来加载异步组件
    const load = () => {
        return loader().catch(err => {
            // 如果用户指定了 onError 回调，则将控制权交给用户
            if (options.onError) {
                // 返回一个新的 Promise 实例
                return new Promise((resolve, reject) => {
                    // 重试
                    const retry = () => {
                        retries++
                        resolve(load())
                    }
                    // 失败
                    const fail = () => {
                        reject(err)
                    }
                    // 作为 onError 回调函数的参数，让用户来决定下一步怎么做
                    options.onError(retry, fail, retries)
                })
            } else {
                throw err
            }
        })
    }

    // 返回一个包装组件
    return {
        name: 'AsyncComponentWrapper',
        setup() {
            // 异步组件是否加载成功
            const loaded = ref(false)
            // 定义 error，当错误发生时，用来存储错误对象
            const error = shallowRef(null)
            // 一个标志，代表是否正在加载，默认为 false
            const loading = ref(false)
            let loadingTimer = null
            // 如果配置项中存在 delay，则开启一个定时器计时，当延迟到时后将 loading.value 设置为 true
            if (options.delay) {
                loadingTimer = setTimeout(() => {
                    loading.value = true
                }, options.delay)
            } else {
                // 如果配置项中没有 delay，则直接标记为加载中
                loading.value = true
            }
            // 代表是否超时，默认为 false，即没有超时
            const timeout = ref(false)
            // 执行加载器函数，返回一个 Promise 实例
            // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true，代表加载成功
            load().then(c => {
                InnerComp = c
                loaded.value = true
            })
            // 添加 catch 语句来捕获加载过程中的错误
            .catch(err => {
                error.value = err
            })
            .finally(() => {
                // 无论加载成功还是失败，都将 loading 标记为 false
                loading.value = false
                // 清除定时器
                clearTimeout(loadingTimer)
            })

            let timer = null
            // 如果设置了超时时间，则在指定时间后将 timeout 标记为 true，代表超时
            if (options.timeout) {
                timer = setTimeout(() => {
                    // 超时后创建一个错误对象，并复制给 error.value
                    const err = new Error(`Async component timed out after${options.timeout}ms.`)
                    error.value = err
                    timeout.value = true
                }, options.timeout)
            }

            // 包装组件被卸载时清除定时器
            onUmounted(() => {
                clearTimeout(timer)
            })

            // 占位内容
            const placeholder = {
                type: 'div',
                children: 'loading...'
            }

            return () => {
                // 如果组件异步加载成功，则渲染被加载的组件
                if (loaded.value) {
                    return { type: InnerComp }
                } else if (error.value && options.errorComponent) {
                    // 只有当错误存在且用户配置了 errorComponent 时才展示 Error组件，同时将 error 作为 props 传递
                    return {
                        type: options.errorComponent,
                        props: { error: error.value }
                    }
                } else if (loading.value && options.loadingComponent) {
                    return {
                        type: options.loadingComponent
                    }
                } else {
                    return placeholder
                }
            }
        }
    }
}
