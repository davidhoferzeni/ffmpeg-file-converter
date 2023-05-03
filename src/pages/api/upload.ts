// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import FfmpegCommand from 'fluent-ffmpeg';
import pathToFfmpeg from 'ffmpeg-static';
import path from 'path';
import { Readable, Duplex } from 'stream';
import formidable from 'formidable';
import MemoryStream from 'memorystream';
import { IncomingMessage } from 'http';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
}

type Data = {
  message: string
}

interface File {
  filePath?: string,
  fileName: string,

}

interface BlobFile extends File {
  fileContent: Blob
}

interface StreamFile extends File {
  fileContent: Duplex
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

function convertFile(inputFileStream: Readable) {
  const timeStamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\.\d\d\dZ/, '');
  const fileName = `${timeStamp}.mp4`;
  const outFilePath = path.join(process.cwd(), 'uploads', fileName);
  return new Promise<BlobFile>((resolve, reject) => {
    if (!pathToFfmpeg) {
      return;
    }
    var logger = new Logger();
    var command = FfmpegCommand({ source: inputFileStream, logger: logger})
      .setFfmpegPath(pathToFfmpeg)
      .format('mp4');
    command.on('error', function (err) {
      console.log('An error occurred: ' + err.message);
      return reject(new Error(err));
    })
      .on('end', function () {
        console.log('Processing finished !');
        setTimeout(() => {
          const outputBuffer = fs.readFileSync(outFilePath);
          const outputBlob = new Blob([outputBuffer]);
          resolve({ filePath: outFilePath, fileName: fileName, fileContent: outputBlob });
        }, 100)
      })
    .save(outFilePath);
  })
}

function readFormData(req: IncomingMessage) {
  const streamWriter = new MemoryStream();
  return new Promise<StreamFile>((resolve, reject) => {
    const form = formidable({
      fileWriteStreamHandler: () => streamWriter
    });
    form.parse(req, (err, fields) => {
      if (err) {
        reject();
      }
      resolve({ fileName: fields.fileName as string, fileContent: streamWriter });
    });
  })
}

async function sendFile(file: Blob, fileTitle: string): Promise<Response> {
  const formData = new FormData();
  formData.append('fileType', 'mp4');
  formData.append('fileName', fileTitle);
  formData.append('fileToUpload', file);
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

function removeFile(filePath?: string) {
  if (!filePath) {
    return;
  }
  fs.unlinkSync(filePath);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const inputFile = await readFormData(req);
  const convertedFile = await convertFile(inputFile.fileContent);
  const uploadResponse = await sendFile(convertedFile.fileContent, convertedFile.fileName);
  await transformResponse(uploadResponse, res);
  removeFile(convertedFile.filePath);
}   