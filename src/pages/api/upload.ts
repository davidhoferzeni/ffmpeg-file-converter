// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import FfmpegCommand, { FfmpegCommandLogger } from 'fluent-ffmpeg';
import pathToFfmpeg from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { PassThrough, Readable, Writable } from 'stream';
import formidable from 'formidable';
import memorystream from 'memorystream';
import { IncomingMessage } from 'http';
import { rejects } from 'assert';

export const config = {
  api: {
    bodyParser: false,
  },
}

type Data = {
  message: string
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

function convertFile(inputFileStream: Readable, outputFilePath: string) {
  return new Promise<void>((resolve, reject) => {
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
          resolve();
        }, 100)
      })
    .save(outputFilePath);
  })
}

function readFormData(req: IncomingMessage, streamWriter: Writable) {
  return new Promise<void>((resolve, reject) => {
    const form = formidable({ 
      multiples: true,
      fileWriteStreamHandler: () => streamWriter
    });
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject();
      }
      resolve();
    });
  })
}


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {

  const inputStream = new memorystream();
  await readFormData(req, inputStream);

  const inFilePath = path.join(process.cwd(), 'uploads', 'test.webm');
  const outFilePath = path.join(process.cwd(), 'uploads', 'test.mp4');
  const inputBuffer = fs.readFileSync(inFilePath);
  const input = Readable.from(inputBuffer);

  await convertFile(inputStream, outFilePath);

  const outputBuffer = fs.readFileSync(outFilePath);
  const outputBlob = new Blob([outputBuffer]);

  const formData = new FormData();
  const timeStamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\.\d\d\dZ/, '');
  const fileTitle = `${timeStamp}_1_Video`;
  formData.append('fileType', 'mp4');
  formData.append('fileName', fileTitle);
  formData.append('fileToUpload', outputBlob);
  formData.append('submit', 'Upload Video');
  const uploadUrl = new URL('https://sandbox.luvdav.com/File_Upload/upload.php');
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });

  const responseMessage = await uploadResponse.text();
  console.log(responseMessage);
  const status = uploadResponse.ok ? 204 : 500;
  res.status(status);
  if (!uploadResponse.ok) {
    const message = 'Something went wrong!';
    res.json({ message: message });
  } else {
    fs.unlinkSync(outFilePath);
    res.json({ message: 'huh?' });
  }
}   