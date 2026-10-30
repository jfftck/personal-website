import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getPrivateObjectDirectory(): string {
  const directory = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!directory) {
    throw new Error("App Storage is not configured for this environment.");
  }
  return directory.replace(/\/+$/, "");
}

function parseBucketObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) {
    throw new Error("Invalid App Storage object path.");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function resolveObjectPath(objectPath: string): {
  bucketName: string;
  objectName: string;
} {
  if (!/^\/objects\/uploads\/[a-f0-9-]{36}$/i.test(objectPath)) {
    throw new Error("Invalid App Storage object reference.");
  }
  const entityPath = objectPath.slice("/objects/".length);
  return parseBucketObjectPath(`${getPrivateObjectDirectory()}/${entityPath}`);
}

export async function createObjectUploadTarget(): Promise<{
  uploadUrl: string;
  objectPath: string;
}> {
  const id = randomUUID();
  const objectPath = createStorageObjectPath(id);
  const entityPath = objectPath.slice("/objects/".length);
  const { bucketName, objectName } = parseBucketObjectPath(
    `${getPrivateObjectDirectory()}/${entityPath}`,
  );
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Could not create App Storage upload target (${response.status}).`);
  }

  const payload = (await response.json()) as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") {
    throw new Error("App Storage returned an invalid upload target.");
  }
  return {
    uploadUrl: payload.signed_url,
    objectPath,
  };
}

export function createStorageObjectPath(id = randomUUID()): string {
  return `/objects/uploads/${id}`;
}

export async function getStoredObject(objectPath: string): Promise<File> {
  const { bucketName, objectName } = resolveObjectPath(objectPath);
  const file = storage.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("The uploaded file was not found in App Storage.");
  return file;
}

export async function getStoredObjectMetadata(objectPath: string) {
  const file = await getStoredObject(objectPath);
  const [metadata] = await file.getMetadata();
  return { file, metadata };
}

export async function deleteStoredObject(objectPath: string): Promise<void> {
  const { bucketName, objectName } = resolveObjectPath(objectPath);
  await storage.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
}

export async function saveStoredObject(
  objectPath: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const { bucketName, objectName } = resolveObjectPath(objectPath);
  await storage.bucket(bucketName).upload(filePath, {
    destination: objectName,
    metadata: { contentType },
    resumable: true,
  });
}

export function readableObjectStream(file: File) {
  return Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>;
}
