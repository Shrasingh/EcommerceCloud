"use client";
import { Billboard } from "@prisma/client";
import Heading from "@/components/ui/heading";
import { Button } from "@/components/ui/button";

import { Plus } from "lucide-react"; //  it brings in the Plus icon component from the lucide-react icon library, used for adding a plus (+) icon in a React application.
import { Separator } from "@radix-ui/react-separator";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import { CategoryColumn, columns } from "./columns";
import { DataTable } from "@/components/ui/data-table";
import { ApiList } from "@/components/ui/api-list";
interface CategoryClientProps {
  data: CategoryColumn[];
}
export const CategoryClient: React.FC<CategoryClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();

  console.log("params -> ", params.storeId);
  return (
    <>
      <div className=" flex items-center justify-between">
        <Heading
          title={`Categories (${data.length})`}
          description="Manage Categories for your store "
        />
        <Button
          onClick={() => router.push(`/${params.storeId}/categories/new`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add New
        </Button>
      </div>
      <Separator />
      <DataTable searchKey="name" columns={columns} data={data} />
      <Heading title="API" description="API calls for Categories" />
      <Separator />
      <ApiList entityName="categories" entityIdName="categoryId" />
    </>
  );
};
