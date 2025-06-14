/**
    在本章中，我们首先介绍了渲染器与响应系统的关系。利用响应
系统的能力，我们可以做到，当响应式数据变化时自动完成页面更新
（或重新渲染）。同时我们注意到，这与渲染器的具体实现无关。我
们实现了一个极简的渲染器，它只能利用 innerHTML 属性将给定的
HTML 字符串内容设置到容器中。

    接着，我们讨论了与渲染器相关的基本名词和概念。渲染器的作
用是把虚拟 DOM 渲染为特定平台上的真实元素，我们用英文 renderer
来表达渲染器。虚拟 DOM 通常用英文 virtual DOM 来表达，有时会简
写成 vdom 或 vnode。渲染器会执行挂载和打补丁操作，对于新的元
素，渲染器会将它挂载到容器内；对于新旧 vnode 都存在的情况，渲
染器则会执行打补丁操作，即对比新旧 vnode，只更新变化的内容。

    最后，我们讨论了自定义渲染器的实现。在浏览器平台上，渲染
器可以利用 DOM API 完成 DOM 元素的创建、修改和删除。为了让渲
染器不直接依赖浏览器平台特有的 API，我们将这些用来创建、修改和
删除元素的操作抽象成可配置的对象。用户可以在调用
createRenderer 函数创建渲染器的时候指定自定义的配置对象，从
而实现自定义的行为。我们还实现了一个用来打印渲染器操作流程的
自定义渲染器，它不仅可以在浏览器中运行，还可以在 Node.js 中运
行。
 */