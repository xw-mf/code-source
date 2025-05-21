const data = {
    foo: 1,
    bar: 11
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

const effectFn = effect(() => {
    return obj.foo + obj.bar
}, {
    scheduler(fn) {
        // 每次调度时将副作用函数添加到 jobQueue 队列中
        jobQueue.add(fn)
        // 执行副作用函数队列
        flushJob()
    },
    lazy: true
})

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

const sumValue = computed(() => {
    console.log('计算了计算了')
    return obj.bar + obj.foo
})
// console.log(sumValue.value, 'sumValue.value')
// console.log(sumValue.value, 'sumValue.value')
// obj.bar++
// obj.foo++
// console.log(obj, 'obj')
// console.log(sumValue.value, 'sumValue.value')
// console.log(sumValue.value, 'sumValue.value')


effect(() => {
    console.log(sumValue.value, '嵌套在 effect 中的 computed')
})

obj.foo++







