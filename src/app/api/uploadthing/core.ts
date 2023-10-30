import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";

import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { pinecone } from "@/lib/pinecone";
const f = createUploadthing();

export const ourFileRouter = {
  pdfUploader: f({ pdf: { maxFileSize: "4MB" } })
    .middleware(async ({ req }) => {
      const { getUser } = getKindeServerSession();
      const user = getUser();

      if (!user || !user.id) throw new Error("Unauthorized");

      //  const subscriptionPlan = await getUserSubscriptionPlan();

      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const createdFile = await db.file.create({
        data: {
          key: file.key,
          name: file.name,
          userId: metadata.userId,
          url: `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`,
          uploadStatus: "PROCESSING",
        },
      });
      try {
        const response = await fetch(
          `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`
        );
        console.log("trying pinecone1");
            const blob = await response.blob();

            const loader = new PDFLoader(blob);

            const pageLevelDocs = await loader.load();

            const pagesAmt = pageLevelDocs.length;

        // vectorize and index entire document
        console.log("trying pinecone2");
        const pineconeIndex = pinecone.Index("pdfyarn");
        console.log("trying pinecone3");
        const embeddings = new OpenAIEmbeddings({
          openAIApiKey: process.env.OPEN_API_KEY,
        });
        console.log("trying pinecone4");
        await PineconeStore.fromDocuments(pageLevelDocs, embeddings, {
          pineconeIndex,
        });
        console.log("trying pinecone5");
        await db.file.update({
          data: {
            uploadStatus: "SUCCESS",
          },
          where: {
            id: createdFile.id,
          },
        });
      } catch (error) {
        console.log("trying pinecone6");
        await db.file.update({
          data: {
            uploadStatus: "FAILED",
          },
          where: {
            id: createdFile.id,
          },
        });
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
