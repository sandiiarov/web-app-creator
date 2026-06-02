import type { VirtualFS } from 'almostnode'
import { type RefObject, useCallback, useState } from 'react'

import {
  agentResponseMessage,
  type AgentResponse,
  createAgentRequest,
  type SelectedElement,
  SERVER_URL,
} from '../lib/agent'
import {
  applyAgentResponseToPreview,
  serializePreviewProject,
} from '../lib/preview-project'
import { errorMessage } from '../lib/tool-result'

export type UseAgentChatOptions = {
  onError: (message: null | string) => void
  vfsRef: RefObject<null | VirtualFS>
}

type ReadyAgentRequest = {
  prompt: string
  selectedElement: null | SelectedElement
  vfs: VirtualFS
}

type ReadyAgentRequestOptions = {
  isEditing: boolean
  prompt: string
  selectedElement: null | SelectedElement
  vfs: null | VirtualFS
}

export function useAgentChat({ onError, vfsRef }: UseAgentChatOptions) {
  const [editStatus, setEditStatus] = useState<null | string>(null)
  const [isEditing, setIsEditing] = useState(false)

  const sendPrompt = useCallback(
    async (prompt: string, selectedElement: null | SelectedElement) => {
      const request = createReadyRequest({
        isEditing,
        prompt,
        selectedElement,
        vfs: vfsRef.current,
      })

      if (!request) {
        return false
      }

      setEditStatus('Sending preview files to AI…')
      setIsEditing(true)
      onError(null)

      try {
        const result = await postAgentRequest(request)

        applyAgentResponseToPreview(request.vfs, result)
        setEditStatus(agentResponseMessage(result))
        return true
      } catch (caught) {
        setEditStatus(null)
        onError(errorMessage(caught))
        return false
      } finally {
        setIsEditing(false)
      }
    },
    [isEditing, onError, vfsRef],
  )

  return {
    editStatus,
    isEditing,
    sendPrompt,
  }
}

function assertAgentResponse(response: Response, result: AgentResponse) {
  if (!response.ok) {
    throw new Error(agentResponseMessage(result))
  }

  if (!result.ok) {
    throw new Error(agentResponseMessage(result))
  }
}

function createReadyRequest({
  isEditing,
  prompt,
  selectedElement,
  vfs,
}: ReadyAgentRequestOptions): null | ReadyAgentRequest {
  const editPrompt = prompt.trim()

  if (!editPrompt || isEditing || !vfs) {
    return null
  }

  return {
    prompt: editPrompt,
    selectedElement,
    vfs,
  }
}

async function postAgentRequest(request: ReadyAgentRequest) {
  const response = await fetch(`${SERVER_URL}/agent`, {
    body: JSON.stringify(
      createAgentRequest({
        files: serializePreviewProject(request.vfs),
        prompt: request.prompt,
        selectedElement: request.selectedElement,
      }),
    ),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const result = (await response.json()) as AgentResponse

  assertAgentResponse(response, result)

  return result
}
