import type { Document } from "@prisma/client";
import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { PerformMutation } from "remix-forms";
import type { Schema } from "zod";
import { z } from "zod";
import { createAuthClient, getSessionUserOrThrow } from "~/auth.server";
import { checkFeatureAbilitiesOrThrow } from "~/lib/utils/application";
import { getParamValueOrThrow } from "~/lib/utils/routes";
import { doPersistUpload, parseMultipart } from "~/storage.server";
import { getEventBySlugOrThrow } from "../../utils.server";
import { checkOwnershipOrThrow } from "../utils.server";
import { createDocumentOnEvent } from "./utils.server";

const schema = z.object({
  userId: z.string(),
  eventId: z.string(),
  uploadKey: z.string(),
  document: z.unknown(),
});

export const uploadDocumentSchema = schema;

// TODO: wrap with performMutation + makeDomainFunction
export type ActionData = PerformMutation<
  z.infer<Schema>,
  z.infer<typeof schema>
>;

export const action: ActionFunction = async (args) => {
  const { request, params } = args;

  const response = new Response();

  const authClient = createAuthClient(request, response);

  await checkFeatureAbilitiesOrThrow(authClient, "events");

  const slug = getParamValueOrThrow(params, "slug");

  const sessionUser = await getSessionUserOrThrow(authClient);

  const event = await getEventBySlugOrThrow(slug);

  await checkOwnershipOrThrow(event, sessionUser);

  const parsedData = await parseMultipart(request);

  const { uploadHandlerResponse, formData } = parsedData;
  const eventId = formData.get("eventId") as string;
  if (eventId !== event.id) {
    throw "Event id nicht korrekt";
  }

  await doPersistUpload(authClient, "documents", uploadHandlerResponse);

  const document: Pick<
    Document,
    "filename" | "path" | "extension" | "sizeInMB" | "mimeType"
  > = {
    filename: uploadHandlerResponse.filename,
    path: uploadHandlerResponse.path,
    extension: uploadHandlerResponse.extension,
    sizeInMB:
      Math.round((uploadHandlerResponse.sizeInBytes / 1024 / 1024) * 100) / 100,
    mimeType: uploadHandlerResponse.mimeType,
  };

  try {
    await createDocumentOnEvent(event.id, document);
  } catch (error) {
    throw "Dokument konnte nicht in der Datenbank gespeichert werden.";
  }

  return json({ headers: response.headers });
};
