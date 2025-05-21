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
    const depsMap = targetMap.get(target)
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()))
    }
    const deps = depsMap.get(key)
    if (!deps) {
        deps.set(key, (deps = new Set()))
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
