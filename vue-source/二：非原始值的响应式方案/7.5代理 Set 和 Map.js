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
    if (!activeEffect || !shouldTrack) return
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

function trigger(target, key, type, newValue) {
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
    // 当操作类型为 ADD 并且目标对象是数组时，应该取出并执行那些与 length 属性相关联的副作用函数
    if (Array.isArray(target) && type === TriggerType.ADD) {
        const lengthEffects = depsMap.get('length')
        lengthEffects && lengthEffects.forEach(effectFn => {
            // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
            if (effectFn !== activeEffect) {
                effectFnToRun.add(effectFn)
            }
        })
    }
    // 如果操作目标是数组，并且修改了数组的 length 属性
    if (Array.isArray(target) && key === 'length') {
        depsMap.forEach((effects, indexKey) => {
            // 假如当前的数组是 ar = [0, 1, 2, 3, 4]，执行了 arr.length = 3
            // 只有那些索引值大于或等于新的 length 属性值的元素才需要触发响应。
            // 此时的 newValue 是设置的 length 的值 newValue = 3
            // indexKey 则为 depsMap 中存储的对应副作用函数的 key 值，对于数组来说就是 0, 1, 2....
            // 执行 arr.length = 3 后，arr[3] 和 arr[4] 需要触发其对应的副作用函数
            if (indexKey >= newValue) {
                effects && effects.forEach(effectFn => {
                    // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
                    if (effectFn !== activeEffect) {
                        effectFnToRun.add(effectFn)
                    }
                })
            }
        })
    }
    // 如果是新增属性或者是删除属性 执行与 ITERATE_KEY 相关联的副作用函数
    if (type === TriggerType.ADD ||
        type === TriggerType.DELETE || 
        // 如果操作类型是 SET，并且目标对象是 Map 类型的数据，
        // 也应该触发那些与 ITERATE_KEY 相关联的副作用函数重新执行
        (type === TriggerType.SET && Object.prototype.toString.call(target) === '[object Map]')) {
        // 拿到与 ITERATE_KEY 关联的副作用函数
        const iterateEffects = depsMap.get(ITERATE_KEY)
        iterateEffects && iterateEffects.forEach(effectFn => {
            // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
            if (effectFn !== activeEffect) {
                effectFnToRun.add(effectFn)
            }
        })
    }
    // 如果是新增属性或者是删除属性 执行与 MAP_KEY_ITERATE_KEY 相关联的副作用函数
    if ((type === TriggerType.ADD ||
        type === TriggerType.DELETE) && 
        // 目标对象是 Map 类型的数据，应该触发那些与 MAP_KEY_ITERATE_KEY 相关联的副作用函数重新执行
        Object.prototype.toString.call(target) === '[object Map]') {
        // 拿到与 MAP_KEY_ITERATE_KEY 关联的副作用函数
        const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
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
let MAP_KEY_ITERATE_KEY = Symbol()

// 重写数组的原型方法
const arrayInstrumentations = {};
['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
    const originMethod = Array.prototype[method]
    arrayInstrumentations[method] = function(...args) {
        let res = originMethod.apply(this, args)
        if (!res || res === -1) {
            res = originMethod.apply(this.raw, args)
        }
        return res
    }
})

// effect(() => {
//     arr.push(1)
// })

// effect(() => {
//     arr.push(1)
// })

// 如果你尝试在浏览器中运行上面这段代码，会得到栈溢出的错误
// （Maximum call stack size exceeded）。
// 问题的原因是 push 方法的调用会间接读取 length 属性。所
// 以，只要我们“屏蔽”对 length 属性的读取，从而避免在它与副作用
// 函数之间建立响应联系，问题就迎刃而解了。这个思路是正确的，因
// 为数组的 push 方法在语义上是修改操作，而非读取操作，所以避免
// 建立响应联系并不会产生其他副作用。

// 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
let shouldTrack = true;
['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
    const originMethod = Array.prototype[method]
    arrayInstrumentations[method] = function(...args) {
        // 在调用原始方法之前，禁止追踪
        shouldTrack = false
        // 下面一行代码执行的时候，会获取数组的 length 属性，进而会被 get 拦截，此时会触发对于 length 属性的响应式依赖收集，但是在执行原始方法之前，我们将 shouldTrack 置为 false，所以当进入 track 方法内部时，会直接 return，从而避免了它与副作用函数之间建立响应联系
        let res = originMethod.apply(this, args)
        // 在调用原始方法之后，恢复原来的行为，即允许追踪
        shouldTrack = true
        return res
    }
})

// 定义一个对象，自定义 Set 和 Map 的方法
const mutableInstrumentations = {
    add(key) {
        // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
        const target = this.raw
        const has = target.has(key)
        // 通过原始数据对象执行 add 方法添加具体的值，
         // 注意，这里不再需要 .bind 了，因为是直接通过 target 调用并执行的
        const res = target.add(key)
        // 调用 trigger 函数触发响应，并指定操作类型为 ADD
        if (!has) {
            trigger(target, key, TriggerType.ADD)
        }
        return res
    },
    delete(key) {
        const target = this.raw
        const has = target.has(key)
        const res = target.delete(key)
        if (has) {
            trigger(target, key, TriggerType.DELETE)
        }
        return res
    },
    get(key) {
        // 获取原始对象
        const target = this.raw
        // 判断读取的 key 是否存在
        const had = target.has(key)
        // 追踪依赖，建立响应联系
        track(target, key)
        // 如果存在，则返回结果。这里要注意的是，如果得到的结果 res 仍然是可代理的数据
        // 则要返回使用 reactive 包装后的响应式数据
        if (had) {
            const res = target.get(key)
            return typeof res === 'object' ? reactive(res) : res
        }
    },
    set(key, value) {
        const target = this.raw
        const oldValue = target.get(key)
        const had = target.has(key)
        // 获取原始数据，由于 value 本身可能已经是原始数据，所以此时 value.raw 不存在，则直接使用 value
        const rawValue = value.raw || value
        target.set(key, rawValue)
        if (!had) {
            trigger(target, key, TriggerType.ADD)
        } else if (oldValue !== value || (oldValue === oldValue && value === value)) {
            trigger(target, key, TriggerType.SET)
        }
    },
    forEach(callback, thisArg) {
        // wrap 函数用来把可代理的值转换为响应式数据
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val
        // 拿到原始数据
        const target = this.raw
        // 与 ITERATE_KEY 建立响应联系
        track(target, ITERATE_KEY)
        // 通过原始数据对象调用 forEach 方法，并把 callback 传递过去
        // 手动调用 callback，用 wrap 函数包裹 value 和 key 后再传给 callback，这样就实现了深响应
        target.forEach((v, k) => {
            callback.call(thisArg, wrap(v), wrap(k), this)
        })
    },
    [Symbol.iterator]: iterationMethod(),
    entires: iterationMethod(),
    values: iterationMethod('values'),
    keys: iterationMethod('keys'),
}

function iterationMethod(key) {
    return function() {
        // wrap 函数用来把可代理的值转换为响应式数据
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val
        // 获取原始数据对象 target
        const target = this.raw
        // 获取原始迭代器方法
        let itr
        if (key === 'values' || key === 'keys') {
            itr = key === 'values' ? target.values() : target.keys()
        } else {
            itr = target[Symbol.iterator]()
        }
        // 调用 track 函数建立响应联系
        if (key === 'keys') {
            track(target, MAP_KEY_ITERATE_KEY)
        } else {
            track(target, ITERATE_KEY)
        }
        // 返回自定义的迭代器
        return {
            next() {
                const { value, done } = itr.next()
                let newValue
                if (key) {
                    newValue = wrap(value)
                } else {
                    newValue = value ? [wrap(value[0]), wrap(value[1])] : value
                }
                return {
                    value: newValue,
                    done
                }
            },
            [Symbol.iterator]() {
                return this
            }
        }
    }
}

// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map()
function reactive(obj) {
    const existionProxy = reactiveMap.get(obj)
    if (existionProxy) return existionProxy
    const proxy = createReactive(obj)
    reactiveMap.set(obj, proxy)
    return proxy
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
        get(target, key) {
            if (key === 'raw') {
                return target
            }
            if (key === 'size') {
                track(target, ITERATE_KEY)
                return Reflect.get(target, key, target)
            }
            return mutableInstrumentations[key]
        }
    })
}

const po = reactive(new Map([
    ['key1', 'value1'],
    ['key2', 'value2']
]))

effect(() => {
    for (const key of po.keys()) {
        console.log(key)
    }
})

po.set('key2', 'value3')
po.set('key3', 'value3')








