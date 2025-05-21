const obj = {
    foo: 1,
    get bar() {
        return this.foo
    }
}

const proxObj = new Proxy(obj, {
    get(target, key, receiver) {
        track(target, key)
        return Reflect.get(target, key, receiver)
    },
    set(target, key, newVal, receiver) {
        const res = Reflect.set(target, key, newVal, receiver)
        trigger(target, key)
        return res
    }
})

effect(() => {
    console.log(proxObj.bar)
})

proxObj.foo++

