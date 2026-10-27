import { notFound } from "next/navigation";
import prismadb from "@/lib/prismadb";

import { CategoryForm } from  "./components/category-form"
import { requireStoreAccess } from "@/lib/require-store";

const CategoryPage = async ({
  params: paramsPromise
}: {
  params: Promise<{ categoryId: string ,storeId: string}>
}) => {
  const params = await paramsPromise;
    await requireStoreAccess(params.storeId);

    const category = await prismadb.category.findFirst({
        where: {
            id: params.categoryId,
            storeId: params.storeId
},
        include : {
          billboard : true
        }
    });
    // "new" opens an empty create form; any other unknown id is a 404.
    if (!category && params.categoryId !== "new") notFound();
   const billboard = await prismadb.billboard.findMany({
    where: {
      storeId: params.storeId
    }
   }) ;
   
  return (
  <div className="flex-col">
   <div className="flex-1 space-y-4 p-8 pt-6">
   <CategoryForm billboards={billboard}
   initialData={category}
   />
   </div>
  </div>
)
};
export default CategoryPage;
