// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import FfmpegCommand from 'fluent-ffmpeg';
import pathToFfmpeg from 'ffmpeg-static';
import { Duplex, Readable } from 'stream';
import formidable from 'formidable';
import MemoryStream from 'memorystream';
import { IncomingMessage } from 'http';
import BlobStream from 'blob-stream';

export const config = {
  api: {
    bodyParser: false,
  },
}

type Data = {
  message: string
}

interface ConvertedFile {
  inputFile: Duplex,
  outputFile: Duplex,
  fileName: string
}

class Logger {
  error = (...data: any[]): void => {
    console.log('e:' + data);
  }
  warn = (...data: any[]): void => {
    console.log('w:' + data);
  }
  info = (...data: any[]): void => {
    console.log('i:' + data);
  }
  debug = (...data: any[]): void => {
    console.log('d:' + data);
  }
}

function convertFile(inputFile: ConvertedFile) {
  return new Promise<void>((resolve, reject) => {
    if (!pathToFfmpeg) {
      return;
    }
    var logger = new Logger();
    var command = FfmpegCommand({ source: inputFile.inputFile, logger: logger })
      .setFfmpegPath(pathToFfmpeg)
      .outputOptions(['-movflags isml+frag_keyframe'])
      .toFormat('mp4');
    command.on('error', function (err) {
      console.log('An error occurred: ' + err.message);
      return reject(new Error(err));
    })
      .on('end', function () {
        console.log('Processing finished !');
        setTimeout(() => {
          resolve();
        }, 100)
      })
      .output(inputFile.outputFile , { end: true })
      .run();
  })
}

function readFormData(req: IncomingMessage) {
  const streamWriter = new MemoryStream();
  return new Promise<ConvertedFile>((resolve, reject) => {
    const form = formidable({
      fileWriteStreamHandler: () => streamWriter
    });
    form.parse(req, (err, fields) => {
      if (err) {
        reject();
      }
      resolve({ fileName: fields.fileName as string, inputFile: streamWriter, outputFile: new MemoryStream() });
    });
  })
}

async function createBlob(stream: Readable){
  const blobStream = BlobStream();
  return new Promise<Blob>((resolve, reject) => {
    stream
    .pipe(blobStream)
    .on('finish', function() {
      var blob = blobStream.toBlob();
      resolve(blob);
    })
    .on('error', function (err) {
      console.log('An error occurred: ' + err.message);
      reject(new Error(err));
    })
  })
}

async function sendFile(file: ConvertedFile): Promise<Response> {
  const fileBlob = await createBlob(file.outputFile);
  const formData = new FormData();
  formData.append('fileType', 'mp4');
  formData.append('fileName', file.fileName);
  formData.append('fileToUpload', fileBlob);
  formData.append('submit', 'Upload Video');
  const uploadUrl = new URL('https://sandbox.luvdav.com/File_Upload/upload.php');
  return await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });
}

async function transformResponse(inputResponse: Response, outputResponse: NextApiResponse) {
  const responseMessage = await inputResponse.text();
  console.log(responseMessage);
  const status = inputResponse.ok ? 204 : 500;
  outputResponse.status(status);
  if (!inputResponse.ok) {
    const message = responseMessage;
    outputResponse.json({ message: message });
  }
  outputResponse.end();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const file = await readFormData(req);
  await convertFile(file);
  const uploadResponse = await sendFile(file);
  await transformResponse(uploadResponse, res);
}   