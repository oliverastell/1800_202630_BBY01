
interface Node {
    name: string,
    aliases: string[],
    type: string,
    path: string,
    properties: { [index: string]: unknown },
    children: Node[],
    _unprocessedChildren: Node[] | string
}

let callbacks: (() => undefined)[] = []
let nodes: Map<string, Node> = new Map();
let loaded = false

export function getMapNodes() {
    if (!loaded) return undefined
    return nodes
}

export function getNode(path: string) {
    return nodes.get(path)
}

export function onDataReady(callback: () => undefined) {
    if (loaded) {
        callback()
    } else {
        callbacks.push(callback)
    }
}

function parseNode(nodeDocument: any, parentPath: string, defaultName: string | undefined = undefined) {
    const type = nodeDocument.type
    const properties: { [index: string]: unknown } = {}
    const unprocessedChildren = []
    const aliases = nodeDocument.aliases || []

    let name = defaultName

    if (!name) {
        name = nodeDocument.type
    }
    if (nodeDocument.name) {
        name = nodeDocument.name
    }
    if (!name) {
        name = "unnamed"
    }

    const path = (parentPath.toString().length === 0) ?
        name : parentPath + "/" + name

    for (let child of nodeDocument.children || []) {
        unprocessedChildren.push(child)
    }

    for (let [key, value] of Object.entries(nodeDocument)) {
        if (
            key === "name" ||
            key === "type" ||
            key === "aliases" ||
            key === "children" ||
            key === "includes"
        ) {
            continue
        }

        properties[key] = value
    }

    let node = {
        name: name,
        aliases: aliases,
        type: type,
        path: path,
        properties: properties,
        children: [],
        _unprocessedChildren: unprocessedChildren,
    } as Node

    nodes.set(node.path, node)
    return node
}

async function initData() {
    const fileListResponse = await fetch("/map/list");

    for (let filePath of await fileListResponse.json()) {
        let fileName = filePath.toString()
        fileName = fileName.slice(0, fileName.lastIndexOf('.') || fileName.length)

        const nodeResponse = await fetch("/map/" + filePath)
        const nodeDocument = await nodeResponse.json()

        let path = ""
        parseNode(nodeDocument, path, fileName)
    }

    for (let [_, node] of nodes) {
        for (let unprocessedChild of node._unprocessedChildren) {
            if (typeof unprocessedChild === "string") {
                let subNode = getNode(unprocessedChild)
                if (subNode !== undefined) {
                    node.children.push(subNode)
                }
            } else {
                node.children.push(unprocessedChild)
            }
        }
    }
}

initData().then(() => {
    loaded = true
    for (let callback of callbacks) {
        callback()
    }
    callbacks = []
})