import sharp from 'sharp';

export async function normalizeJpeg(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<1000||bytes.length>2000000)throw Error('La imagen debe ser un JPEG de hasta 2 MB.');
  const pipeline=sharp(bytes,{failOn:'warning',limitInputPixels:16000000});
  const metadata=await pipeline.metadata();
  if(metadata.format!=='jpeg'||metadata.width<480||metadata.height<480)throw Error('JPEG inválido o resolución inferior a 480 × 480.');
  const result=await pipeline.rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer({resolveWithObject:true});
  return {bytes:result.data,width:result.info.width,height:result.info.height};
}
