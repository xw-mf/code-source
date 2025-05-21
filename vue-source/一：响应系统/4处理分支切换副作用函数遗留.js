const data = {
    ok: true,
    text: '张三111'
}

const proxy = new Proxy(data, {
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
    const effectFnToRun = new Set(effects)
    effectFnToRun.forEach((effectFn) => effectFn())
    // effects && effects.forEach(fn => fn());
}

function effect(fn) {
    const effectFn = () => {
        // 执行副作用函数前清除依赖集合
        cleanup(effectFn)
        activeEffect = effectFn
        fn()
    }
    effectFn.deps = []
    effectFn()
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

effect(() => {
    console.log('执行了！！！')
    document.body.innerText = proxy.ok ? proxy.text : ''
})

setTimeout(() => {
    proxy.ok = false
}, 1500);

setTimeout(() => {
    // 执行以下代码不会执行副作用函数
    proxy.text = '李四111'
}, 3000);

