import base64
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.features.speeches.schemas import SynthesizeRequest
from app.features.speeches.service import SpeechService

router = APIRouter()


def get_speeches(request: Request) -> SpeechService:
    return request.app.state.container.speeches


SpeechesDep = Annotated[SpeechService, Depends(get_speeches)]


@router.post("/tts/synthesize", response_class=Response)
def tts_synthesize(body: SynthesizeRequest, speeches: SpeechesDep) -> Response:
    request = speeches.store_reference(body.to_request(), body.reference_audio, body.reference_name)
    result = speeches.synthesize(request)
    return Response(
        content=result.content,
        media_type="audio/wav",
        headers={
            "X-Duration-Ms": str(result.duration_ms),
            "X-Sample-Rate": str(result.sample_rate),
            "X-Cache": "hit" if result.cached else "miss",
            "X-Subtitles": base64.b64encode(result.subtitles.encode("utf-8")).decode("ascii"),
        },
    )
