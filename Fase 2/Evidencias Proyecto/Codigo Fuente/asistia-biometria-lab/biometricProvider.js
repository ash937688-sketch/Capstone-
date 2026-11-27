// Only the server imports this adapter. No credentials, images or FaceIds reach the browser.
export function createRekognitionProvider({ region, collection }, { client, commands } = {}) {
  let sdk = commands, connection = client;
  async function call(command, input) {
    sdk ||= await import('@aws-sdk/client-rekognition');
    connection ||= new sdk.RekognitionClient({ region, maxAttempts: 1 });
    return connection.send(new sdk[command](input), { abortSignal: AbortSignal.timeout(20000) });
  }
  async function find(externalId) {
    const ids = []; let next;
    do {
      const result = await call('ListFacesCommand', { CollectionId: collection, MaxResults: 4096, ...(next ? { NextToken: next } : {}) });
      for (const face of result.Faces || []) if (face.ExternalImageId === externalId) ids.push(face.FaceId);
      next = result.NextToken;
    } while (next);
    return ids;
  }
  return {
    async enroll(bytes, externalId) {
      // Recovery after a crash/timeout: the opaque external ID is stable across attempts.
      const existing = await find(externalId);
      if (existing.length === 1) return { faceIds: existing };
      if (existing.length > 1) throw Error('Ambiguous provider record');
      const detected = await call('DetectFacesCommand', { Image: { Bytes: bytes }, Attributes: ['DEFAULT'] });
      if (detected.FaceDetails?.length !== 1) throw Object.assign(Error('La fotografía debe contener exactamente un rostro.'), { status: 422 });
      const indexed = await call('IndexFacesCommand', { CollectionId: collection, Image: { Bytes: bytes }, ExternalImageId: externalId, MaxFaces: 1, QualityFilter: 'HIGH', DetectionAttributes: ['DEFAULT'] });
      const faceIds = (indexed.FaceRecords || []).map(record => record.Face?.FaceId).filter(Boolean);
      if (faceIds.length !== 1 || indexed.UnindexedFaces?.length) {
        if (faceIds.length) await call('DeleteFacesCommand', { CollectionId: collection, FaceIds: faceIds });
        throw Object.assign(Error('El proveedor no aceptó la calidad facial. Solicita una captura nueva.'), { status: 422 });
      }
      return { faceIds, modelVersion: indexed.FaceModelVersion || null };
    },
    async remove(externalId, reference) {
      // Include any uncommitted result of an interrupted IndexFaces call.
      const ids = [...new Set([...(reference?.faceIds || []), ...await find(externalId)])];
      if (!ids.length) return;
      const result = await call('DeleteFacesCommand', { CollectionId: collection, FaceIds: ids });
      const deleted = new Set(result.DeletedFaces || []);
      if (ids.some(id => !deleted.has(id))) {
        // A concurrent delete may already have removed it. Confirm absence before acknowledging.
        if ((await find(externalId)).length) throw Error('Provider deletion not confirmed');
      }
    },
  };
}
