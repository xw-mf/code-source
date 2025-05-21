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

const obj = {
    foo: 1,
}

const po = new Proxy(obj, {
    get(target, key, receiver) {
        track(target, key)
        return Reflect.get(target, key, receiver)
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
        // 但是区分是新增属性还是已有属性的更改 因为已有属性的修改并不需要重新执行 for in 循环
        const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
        const res = Reflect.set(target, key, newVal, receiver)
        // 触发副作用函数执行的时候，取出与 ITERATE_KEY 关联的副作用函数并执行
        trigger(target, key, type)
        return res
    },
    deleteProperty(target, key) {
        // 检查被删除属性是否是对象自己的属性
        const hasProperty = Object.prototype.hasOwnProperty.call(target, key)
        const res = Reflect.deleteProperty(target, key)
        if (hasProperty && res) {
            trigger(target, key, 'DELETE')
        }
        return res
    }
})

// for in
effect(() => {
    console.log('执行了执行了')
    for (const key in po) {
        console.log(key, 'key')
    }
})

// 新增属性
po.bar = 2

// 已有属性更改
po.foo = 2

// 删除属性
delete po.bar

