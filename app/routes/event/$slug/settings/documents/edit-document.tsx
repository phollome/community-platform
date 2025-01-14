import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { makeDomainFunction } from "remix-domains";
import type { PerformMutation } from "remix-forms";
import { performMutation } from "remix-forms";
import type { Schema } from "zod";
import { z } from "zod";
import { createAuthClient, getSessionUserOrThrow } from "~/auth.server";
import { updateDocument } from "~/document.server";
import { checkFeatureAbilitiesOrThrow } from "~/lib/utils/application";
import { getParamValueOrThrow } from "~/lib/utils/routes";
import { getEventBySlugOrThrow } from "../../utils.server";
import { checkIdentityOrThrow, checkOwnershipOrThrow } from "../utils.server";

const schema = z.object({
  userId: z.string(),
  eventId: z.string(),
  documentId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  extension: z.string(),
});

const environmentSchema = z.object({
  eventId: z.string(),
});

export const editDocumentSchema = schema;

const mutation = makeDomainFunction(
  schema,
  environmentSchema
)(async (values, environment) => {
  if (values.eventId !== environment.eventId) {
    throw "Event id nicht korrekt";
  }
  let title;
  if (values.title !== undefined) {
    if (!values.title.includes("." + values.extension)) {
      title = values.title + "." + values.extension;
    } else {
      title = values.title;
    }
  } else {
    title = null;
  }
  try {
    await updateDocument(values.documentId, {
      title: title,
      description: values.description || null,
    });
  } catch (error) {
    throw "Dokument konnte nicht editiert werden.";
  }
  return values;
});

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

  await checkIdentityOrThrow(request, sessionUser);

  const event = await getEventBySlugOrThrow(slug);

  await checkOwnershipOrThrow(event, sessionUser);

  const result = await performMutation({
    request,
    schema,
    mutation,
    environment: { eventId: event.id },
  });

  return json<ActionData>(result, { headers: response.headers });
};
