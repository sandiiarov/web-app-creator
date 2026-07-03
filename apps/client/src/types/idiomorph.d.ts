declare module 'idiomorph' {
  export const Idiomorph: IdiomorphApi

  export interface IdiomorphApi {
    defaults: IdiomorphOptions
    morph: (
      existingNode: Element,
      newContent: Document | Element | HTMLCollection | Node[] | string,
      options?: IdiomorphOptions,
    ) => void
  }

  export interface IdiomorphCallbacks {
    afterNodeAdded?: (node: Node) => void
    afterNodeMorphed?: (oldNode: Element, newNode: Node) => void
    afterNodeRemoved?: (node: Element) => void
    beforeAttributeUpdated?: (
      attributeName: string,
      node: Element,
      mutationType: 'remove' | 'update',
    ) => boolean
    beforeNodeAdded?: (node: Node) => boolean
    beforeNodeMorphed?: (oldNode: Element, newNode: Node) => boolean
    beforeNodeRemoved?: (node: Element) => boolean
  }

  export interface IdiomorphHeadOptions {
    afterHeadMorphed?: (
      head: Element,
      mutations: {
        added: Node[]
        kept: Element[]
        removed: Element[]
      },
    ) => void
    block?: boolean
    ignore?: boolean
    shouldPreserve?: (node: Element) => boolean
    shouldReAppend?: (node: Element) => boolean
    shouldRemove?: (node: Element) => boolean
    style?: IdiomorphHeadStyle
  }

  export type IdiomorphHeadStyle = 'append' | 'merge' | 'morph' | 'none'

  export type IdiomorphMorphStyle = 'innerHTML' | 'outerHTML'

  export interface IdiomorphOptions {
    callbacks?: IdiomorphCallbacks
    head?: IdiomorphHeadOptions
    ignoreActive?: boolean
    ignoreActiveValue?: boolean
    morphStyle?: IdiomorphMorphStyle
    restoreFocus?: boolean
  }
}
