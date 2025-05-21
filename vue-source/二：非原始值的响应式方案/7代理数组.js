const TriggerType = {
    SET: 'SET',
    ADD: 'ADD',
    DELETE: 'DELETE'
}

let activeEffect = null
// 副作用函数调用栈
let effectStack = []
const targetMap = new WeakMap()
function track(target, key) {
    if (!activeEffect) return
    let depsMap = targetMap.get(target)
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()))
    }
    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }
    deps.add(activeEffect)
    activeEffect.deps.push(deps)
}

function trigger(target, key, type) {
    const depsMap = targetMap.get(target)
    if (!depsMap) return
    const effects = depsMap.get(key)
    const effectFnToRun = new Set()
    effects && effects.forEach(effectFn => {
        // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
        if (effectFn !== activeEffect) {
            effectFnToRun.add(effectFn)
        }
    })
    // 如果是新增属性或者是删除属性 执行与 ITERATE_KEY 相关联的副作用函数
    if (type === TriggerType.ADD || type === TriggerType.DELETE) {
        // 拿到与 ITERATE_KEY 关联的副作用函数
        const iterateEffects = depsMap.get(ITERATE_KEY)
        iterateEffects && iterateEffects.forEach(effectFn => {
            // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
            if (effectFn !== activeEffect) {
                effectFnToRun.add(effectFn)
            }
        })
    }
    effectFnToRun.forEach((effectFn) => {
        if (effectFn.options && effectFn.options.scheduler) {
            effectFn.options.scheduler(effectFn)
        } else {
            effectFn()
        }
    })
}

// 是否正在执行任务
let isFlushing = false
// 构造一个任务队列
const jobQueue = new Set()
// 将 job 放到微任务队列中执行
const p = Promise.resolve()
function flushJob() {
    if (isFlushing) return
    isFlushing = true
    p.then(() => {
        jobQueue.forEach(job => {
            job()
        })
    }).finally(() => {
        isFlushing = false
    })
}

function effect(fn, options) {
    const effectFn = () => {
        // 执行副作用函数前清除依赖集合
        cleanup(effectFn)
        activeEffect = effectFn
        // 调用副作用函数前将副作用函数压入栈中
        effectStack.push(activeEffect)
        // 缓存副作用函数（getter）的执行结果
        const res = fn()
        // 执行完副作用函数后将当前副作用函数弹出，并将恢复 activeEffect 为之前的值
        effectStack.pop()
        activeEffect = effectStack[effectStack.length - 1]
        return res
    }
    effectFn.options = options
    effectFn.deps = []
    if (!options || !options.lazy) {
        effectFn()
    }
    return effectFn
}

function cleanup(effectFn) {
    for (let i = 0; i < effectFn.deps.length; i++) {
        const deps = effectFn.deps[i]
        // 将 effectFn 从依赖集合中清除
        deps.delete(effectFn)
    }
    // 重置 effectFn.deps 数组
    effectFn.deps.length = 0
}

function computed(getter) {
    // 缓存 value
    let value
    // 脏标志  用来标识是否需要重新计算  如果为 true 则需要重新计算
    let dirty = true
    // 将 getter 作为副作用函数
    const effectFn = effect(getter, {
        lazy: true,
        scheduler() {
            if (!dirty) {
                dirty = true
                // 手动 trigger obj
                trigger(obj, 'value')
            }
        }
    })

    const obj = {
        // 当读取 value 时才执行 effectFn
        get value() {
            // 只有在 脏 的时候才重新计算
            if (dirty) {
                value = effectFn()
                // 将 dirty 置为 false  下次可以直接用到缓存值
                dirty = false
            }
            // 手动 track obj
            track(obj, 'value')
            return value
        }
    }

    return obj
}

function traverse(source, seen = new Set()) {
    if (typeof source !== 'object' || source === null || seen.has(source)) return
    seen.add(source)
    // 假设 source 是一个对象
    for (const key in source) {
        traverse(source[key], seen)
    }

    return source
}

const watch = (source, cb, options = {}) => {
    let getter
    if (typeof source === 'function') {
        getter = source
    } else {
        getter = () => traverse(source)
    }

    // 存储用户传入的过期回调
    let cleanup
    function onInvalidate(fn) {
        cleanup = fn
    }

    const job = () => {
        newValue = effectFn()
        // 执行回调函数前先执行（如果有）过期回调函数
        // 首次执行回调函数时会注册存储过期回调，并不会执行过期回调
        // 当第二次+触发回调函数时，会执行上个回调函数注册的过期回调
        if (cleanup) {
            cleanup()
        }
        cb(newValue, oldValue, onInvalidate)
        oldValue = newValue
    }

    let newValue, oldValue
    const effectFn = effect(() => getter(), {
        lazy: true,
        scheduler: () => {
            if (options && options.flush && options.flush === 'post') {
                const p = Promise.resolve()
                p.then(job)
            } else {
                job()
            }
        }
    })
    if (options && options.immediate) {
        // 如果 immediate 是 true  立即执行回调
        job()
    } else {
        oldValue = effectFn()
    }
}

let ITERATE_KEY = Symbol()

function reactive(obj) {
    return createReactive(obj)
}

function shallowReactive(obj) {
    return createReactive(obj, true)
}

function readonly(obj) {
    return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
    return createReactive(obj, true, true)
}

/**
 * 
 * @param {*} obj 源对象
 * @param {*} isShallow 是否浅响应
 * @param {*} isReadonly 是否只读 
 * @returns 
 */
function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            if (key === 'raw') {
                return target
            }
            const res = Reflect.get(target, key, receiver)
            // 不是只读时才触发依赖收集
            if (!isReadonly) {
                track(target, key)
            }
            // 浅响应 直接返回 不再递归
            if (isShallow) {
                return res
            }
            if (typeof res === 'object' && res !== null) {
                return isReadonly ? readonly(res) : reactive(res)
            }
            return res
        },
        has(target, key) {
            track(target, key)
            return Reflect.has(target, key)
        },
        // 针对 for in 循环的拦截
        // 因为在调用 ownKeys 时拿不到具体操作的 key，所以定义一个 symbol 字符来关联副作用函数
        ownKeys(target) {
            // 将副作用函数与 ITERATE_KEY 关联
            track(target, ITERATE_KEY)
            return Reflect.ownKeys(target)
        },
        set(target, key, newVal, receiver) {
            if (isReadonly) {
                console.warn(`${key}属性是只读的！`)
                return true
            }
            const oldVal = target[key]
            // 但是区分是新增属性还是已有属性的更改 因为已有属性的修改并不需要重新执行 for in 循环
            const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
            const res = Reflect.set(target, key, newVal, receiver)
            // 当 receiver 是 target 的代理对象时才触发副作用函数 屏蔽由原型引发的更新
            if (target === receiver.raw) {
                // 新旧值不一样时才触发 trigger (oldVal === oldVal || newVal === newVal)为了排除 NaN 的情况
                if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
                    trigger(target, key, type)
                }
            }
            return res
        },
        deleteProperty(target, key) {
            if (isReadonly) {
                console.warn(`${key}属性是只读的！`)
                return true
            }
            // 检查被删除属性是否是对象自己的属性
            const hasProperty = Object.prototype.hasOwnProperty.call(target, key)
            const res = Reflect.deleteProperty(target, key)
            if (hasProperty && res) {
                trigger(target, key, 'DELETE')
            }
            return res
        }
    })
}

// 通过索引访问数组元素值：arr[0]。
// 访问数组的长度：arr.length。
// 把数组作为对象，使用 for...in 循环遍历。
// 使用 for...of 迭代遍历数组。
// 数组的原型方法，如
// concat/join/every/some/find/findIndex/includes
// 等，以及其他所有不改变原数组的原型方法。
// 可以看到，对数组的读取操作要比普通对象丰富得多。我们再来
// 看看对数组元素或属性的设置操作有哪些。
// 通过索引修改数组元素值：arr[1] = 3。
// 修改数组长度：arr.length = 0。
// 数组的栈方法：push/pop/shift/unshift。
// 修改原数组的原型方法：splice/fill/sort 等。

const obj = [0]

const po = reactive(obj)

effect(() => {
    console.log('执行了执行了')
    console.log(po[0])
})

po[0] = 3


