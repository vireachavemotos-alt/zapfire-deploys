-- AlterTable
ALTER TABLE "Contato" ADD COLUMN "categoria" TEXT;

-- CreateIndex
CREATE INDEX "Contato_categoria_idx" ON "Contato"("categoria");
