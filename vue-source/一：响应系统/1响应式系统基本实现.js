const bucket = new Set()
const data = {
    text: '张三'
}
const obj = new Proxy(data, {
    get(target, key, receiver) {
        bucket.add(effect)
        return Reflect.get(target, key)
    },
    set(target, key, newVal, receiver) {
        const result = Reflect.set(target, key, newVal)
        bucket.forEach(fn => fn())
        return result
    }
})

function effect() {
    document.body.innerText = obj.text
}

effect()

setTimeout(() => {
    obj.text = '李四'
}, 2000)