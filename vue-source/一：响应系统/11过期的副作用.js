const data = {
    foo: 1
}

const obj = new Proxy(data, {
    get(target, key, receiver) {
        track(target, key)
        return Reflect.get(target, key, receiver)
    },
    set(target, key, newVal, receiver) {
        const result = Reflect.set(target, key, newVal, receiver)
        trigger(target, key)
        return result
    }
})

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

function trigger(target, key) {
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

let index = 0
// 模拟网络请求
const plus = (delay, i) => {
    setTimeout(() => {
        index = i
    }, delay)
}
watch(() => obj.foo, (newValue, oldValue, onInvalidate) => {
    console.log('数据变化了！')
    let isExpired = false
    onInvalidate(() => {
        isExpired = true
    })
    if (newValue === 2) {
        setTimeout(() => {
            if (!isExpired) {
                index = newValue
            }
        }, 3000)
    }
    if (newValue === 3) {
        setTimeout(() => {
            if (!isExpired) {
                index = newValue
            }
        }, 1000)
    }
})

obj.foo = obj.foo + 1
obj.foo = obj.foo + 1







