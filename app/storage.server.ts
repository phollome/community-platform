import type { SupabaseClient } from "@supabase/auth-helpers-remix";
import type { Document } from "@prisma/client";
import {
  unstable_composeUploadHandlers,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { UploadHandler } from "@remix-run/node";
import { fromBuffer } from "file-type";
import JSZip from "jszip";
import { badRequest, serverError } from "remix-utils";
import { createHashFromString } from "./utils.server";
import { escapeFilenameSpecialChars } from "./lib/string/escapeFilenameSpecialChars";

const uploadKeys = ["avatar", "background", "logo", "document"];
const imageUploadKeys = ["avatar", "background", "logo"];

export function generatePathName(
  extension: string,
  hash: string,
  name: string
) {
  return `${hash.substring(0, 2)}/${hash.substring(2)}/${name}.${extension}`;
}

const uploadHandler: UploadHandler = async (part) => {
  // TODO: remove file-type package and use contentType...only if Remix uses file header
  const { contentType, data, name, filename } = part;

  let bytes = [];
  for await (let chunk of data) {
    bytes.push(...chunk);
  }

  const array = new Uint8Array(bytes);

  const buffer = Buffer.from(array.buffer);

  if (!uploadKeys.includes(name)) {
    return buffer.toString();
  }

  const hash = await createHashFromString(buffer.toString());
  const fileTypeResult = await fromBuffer(buffer);
  if (fileTypeResult === undefined) {
    throw serverError({
      message: "Der Dateityp (MIME type) konnte nicht gelesen werden.",
    });
  }
  if (name === "document" && fileTypeResult.mime !== "application/pdf") {
    throw serverError({
      message:
        "Aktuell können ausschließlich Dateien im PDF-Format hochgeladen werden.",
    });
  }
  if (
    imageUploadKeys.includes(name) &&
    !fileTypeResult.mime.includes("image/")
  ) {
    throw serverError({
      message:
        "Die Datei entspricht keinem gängigem Bildformat und konnte somit nicht hochgeladen werden.",
    });
  }
  const path = generatePathName(fileTypeResult.ext, hash, name);
  const sizeInBytes = buffer.length;

  return JSON.stringify({
    buffer,
    path,
    filename,
    extension: fileTypeResult.ext,
    mimeType: fileTypeResult.mime,
    sizeInBytes,
  });
};

async function persistUpload(
  authClient: SupabaseClient,
  path: string,
  buffer: Buffer,
  bucketName: string,
  mimeType: string
) {
  return await authClient.storage.from(bucketName).upload(path, buffer, {
    upsert: true,
    contentType: mimeType,
  });
}

function validatePersistence(
  authClient: SupabaseClient,
  error: any,
  data: any,
  path: string,
  bucketName?: string
) {
  if (error || data === null) {
    console.log(error);
    throw serverError({ message: "Hochladen fehlgeschlagen." });
  }

  if (getPublicURL(authClient, path, bucketName) === null) {
    throw serverError({
      message: "Die angefragte URL konnte nicht gefunden werden.",
    });
  }
}

export const parseMultipart = async (request: Request) => {
  try {
    const formData = await unstable_parseMultipartFormData(
      request,
      unstable_composeUploadHandlers(uploadHandler)
    );
    const uploadKey = formData.get("uploadKey");
    if (uploadKey === null) {
      throw serverError({ message: "Something went wrong on upload." });
    }
    const uploadHandlerResponseJSON = formData.get(uploadKey as string);
    if (uploadHandlerResponseJSON === null) {
      throw serverError({ message: "Something went wrong on upload." });
    }
    let uploadHandlerResponse: {
      buffer: {
        type: "Buffer";
        data: number[];
      };
      path: string;
      filename: string;
      extension: string;
      mimeType: string;
      sizeInBytes: number;
    } = JSON.parse(uploadHandlerResponseJSON as string);
    // Convert buffer.data (number[]) to Buffer
    const buffer = Buffer.from(uploadHandlerResponse.buffer.data);
    if (buffer.length === 0) {
      throw serverError({ message: "Cannot upload empty file." });
    }

    if (buffer.length > 5_000_000) {
      throw serverError({ message: "File is too big." });
    }

    return {
      uploadHandlerResponse: {
        ...uploadHandlerResponse,
        buffer,
      },
      formData,
    };
  } catch (e) {
    throw "Error on upload document.";
  }
};

export async function doPersistUpload(
  authClient: SupabaseClient,
  bucketName: string,
  uploadHandlerResponse: {
    buffer: Buffer;
    path: string;
    filename: string;
    extension: string;
    mimeType: string;
    sizeInBytes: number;
  }
) {
  const { data, error } = await persistUpload(
    authClient,
    uploadHandlerResponse.path,
    uploadHandlerResponse.buffer,
    bucketName,
    uploadHandlerResponse.mimeType
  );
  validatePersistence(
    authClient,
    error,
    data,
    uploadHandlerResponse.path,
    bucketName
  );

  return true;
}

export function getPublicURL(
  authClient: SupabaseClient,
  relativePath: string,
  bucket = "images"
) {
  const {
    data: { publicUrl },
  } = authClient.storage.from(bucket).getPublicUrl(relativePath);

  if (publicUrl === "") {
    throw serverError({
      message: "Die öffentliche URL der Datei konnte nicht erzeugt werden.",
    });
  }

  if (
    bucket === "images" &&
    process.env.SUPABASE_IMG_URL !== undefined &&
    process.env.SUPABASE_URL !== undefined
  ) {
    return publicUrl.replace(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_IMG_URL
    );
  }

  return publicUrl;
}

export async function download(
  authClient: SupabaseClient,
  relativePath: string,
  bucket = "documents"
) {
  const { data, error } = await authClient.storage
    .from(bucket)
    .download(relativePath);

  if (data === null || error !== null) {
    throw serverError({
      message: "Datei konnte nicht heruntergeladen werden.",
    });
  }
  return data;
}

export async function getDownloadDocumentsResponse(
  authClient: SupabaseClient,
  additionalHeaders: Headers,
  documents: Pick<Document, "title" | "filename" | "path">[],
  zipFilename: string = "Dokumente.zip"
) {
  if (documents.length === 0) {
    throw badRequest({
      message: "Please pass at least one document inside the documents array.",
    });
  }

  const files = await Promise.all(
    documents.map(async (document) => {
      const blob = await download(authClient, document.path);
      let file = {
        name: document.title || document.filename,
        content: await blob.arrayBuffer(),
        type: blob.type,
      };
      return file;
    })
  );

  let file;
  let filename;
  let contentType;
  if (files.length === 1) {
    file = files[0].content;
    filename = files[0].name;
    contentType = files[0].type;
  } else {
    const zip = new JSZip();
    files.map((file) => {
      zip.file(file.name, file.content);
      return null;
    });
    file = await zip.generateAsync({ type: "arraybuffer" });
    contentType = "application/zip";
    filename = `${zipFilename}`;
  }

  filename = escapeFilenameSpecialChars(filename);

  // TODO: Check for missing headers
  return new Response(file, {
    status: 200,
    headers: {
      ...additionalHeaders,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}

export async function remove(
  authClient: SupabaseClient,
  paths: string[],
  bucket = "images"
) {
  const { data, error } = await authClient.storage.from(bucket).remove(paths);

  if (data === null || error !== null) {
    throw serverError({
      message: "Datei konnte nicht gelöscht werden.",
    });
  }
}
