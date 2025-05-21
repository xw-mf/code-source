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
}

function trigger(target, key) {
    const depsMap = targetMap.get(target)
    if (!depsMap) return
    const effects = depsMap.get(key)
    effects && effects.forEach(fn => fn());
}

function effect(fn) {
    activeEffect = fn
    fn()
}

effect(() => {
    console.log('执行了！！！')
    document.body.innerText = proxy.ok ? proxy.text : ''
})

setTimeout(() => {
    proxy.ok = false
}, 1500);

setTimeout(() => {
    // 执行以下代码一样会执行副作用函数，导致副作用函数遗留问题
    proxy.text = '李四111'
}, 3000);
