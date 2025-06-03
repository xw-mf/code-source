function createRenderer() {
    function render(vnode, container) {
        // 如果有新的 vnode
        if (vnode) {
            // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
            patch(container._vnode, vnode, container)
        } else {
            // 旧 vnode 存在，且新 vnode 不存在，说明是卸载（unmount）操作
            // 只需要将 container 内的 DOM 清空即可
            if (container._vnode) {
                // 说明是卸载
                container.innerHTML = ''
            }
        }
        // 把 vnode 存储到 container._vnode 下，即后续渲染中的旧 vnode
        container._vnode = vnode
    }
    
    /**
     * 
     * @param {*} n1 旧 vnode
     * @param {*} n2 新vnode
     * @param {*} container 容器
     */
    function patch(n1, n2, container) {}

    return {
        render
    }
}