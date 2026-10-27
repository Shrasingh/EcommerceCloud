import { notFound } from "next/navigation";
import prismadb from "@/lib/prismadb";

import { ColorForm } from "./components/color-form"
import { requireStoreAccess } from "@/lib/require-store";

const ColorPage = async ({
  params: paramsPromise
}: {
  params: Promise<{ colorId: string; storeId: string }>
}) => {
  const params = await paramsPromise;
    await requireStoreAccess(params.storeId);
    const color = await prismadb.color.findFirst({
        where: {
            id: params.colorId,
            storeId: params.storeId
}
    });
    // "new" opens an empty create form; any other unknown id is a 404.
    if (!color && params.colorId !== "new") notFound();
  return (
  <div className="flex-col">
   <div className="flex-1 space-y-4 p-8 pt-6">
   <ColorForm
   initialData={color}
   />
   </div>
  </div>
)
};
export default ColorPage;
