import { notFound } from "next/navigation";
import prismadb from "@/lib/prismadb";

import {BillboardForm} from "./components/billboard-form"
import { requireStoreAccess } from "@/lib/require-store";

const BillboardPage = async ({
  params: paramsPromise
}: {
  params: Promise<{ billboardId: string; storeId: string }>
}) => {
  const params = await paramsPromise;
    await requireStoreAccess(params.storeId);
    const billboard = await prismadb.billboard.findFirst({
        where: {
            id: params.billboardId,
            storeId: params.storeId
}
    });
    // "new" opens an empty create form; any other unknown id is a 404.
    if (!billboard && params.billboardId !== "new") notFound();
  return (
  <div className="flex-col">
   <div className="flex-1 space-y-4 p-8 pt-6">
   <BillboardForm
   initialData={billboard}
   />
   </div>
  </div>
)
};
export default BillboardPage;
