import { notFound } from "next/navigation";
import prismadb from "@/lib/prismadb";

import {SizeForm} from "./components/size-form"
import { requireStoreAccess } from "@/lib/require-store";

const SizePage = async ({
  params: paramsPromise
}: {
  params: Promise<{ sizeId: string; storeId: string }>
}) => {
  const params = await paramsPromise;
    await requireStoreAccess(params.storeId);
    const size = await prismadb.size.findFirst({
        where: {
            id: params.sizeId,
            storeId: params.storeId
}
    });
    // "new" opens an empty create form; any other unknown id is a 404.
    if (!size && params.sizeId !== "new") notFound();
  return (
  <div className="flex-col">
   <div className="flex-1 space-y-4 p-8 pt-6">
   <SizeForm
   initialData={size}
   />
   </div>
  </div>
)
};
export default SizePage;
