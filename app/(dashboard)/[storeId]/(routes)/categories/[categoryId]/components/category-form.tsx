"use client"

import {useForm } from "react-hook-form";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import axios from "axios"
import toast from "react-hot-toast";

import { Billboard, Category } from "@prisma/client";
import Heading from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash } from "lucide-react";
import { Separator } from "@/components/ui/separator";

import { 
    Form,
    FormField, 
    FormControl, 
    FormLabel, 
    FormMessage, 
    FormItem } from "@/components/ui/form";
import { AlertModal } from "@/components/modals/alert-modal";
import { Select } from "@/components/ui/select";
import { 
    SelectContent, 
    SelectTrigger, 
    SelectValue,
    SelectItem
} from "@/components/ui/select";


const formSchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    billboardId : z.string().min(1, { message: "Billboard id is required" }),
})

interface CategoryFormProps {
    initialData : Category | null;
    billboards : Billboard[]
}

type CategoryFormValues = z.infer<typeof formSchema>


export const CategoryForm : React.FC<CategoryFormProps> = ({
    initialData ,
    billboards
}) => {



    const params = useParams();
    const router = useRouter();
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const title = initialData ? "Edit category" : "Create category";
    const description = initialData ? "Update your category." : "Add a new category.";
    const toastMessage  = initialData? "Category updated successfully." : "Category created successfully."
    const action = initialData ? "Save changes" : "Create";


    const form = useForm<CategoryFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues:  initialData || {
            name: "",
            billboardId : "",
        },
    });

    const onSubmit = async (data: CategoryFormValues) => {
        try {
            
            setLoading(true);
            if(initialData) {
                await axios.patch(`/api/${params.storeId}/categories/${params.categoryId}`, data);
                console.log("patched", params.catergoryId );
            } else {
                await axios.post(`/api/${params.storeId}/categories`, data);
            }

            router.refresh();
            router.push(`/${params.storeId}/categories`);
            toast.success("Category updated successfully");
            
        } catch (error: any) {
            toast.error("Something went wrong.", error.message);
        } finally {
            setLoading(false);
        }
    }

    const onDelete = async () => {
        try {
            setLoading(true);
            await axios.delete(`/api/${params.storeId}/categories/${params.categoryId}`);
            router.refresh();
            router.push(`/${params.storeId}/categories`);
            toast.success("Category deleted");
            
        } catch (error) {
            toast.error("Make sure you removed all products using this category first, then try again.")
        } finally {
            setLoading(false);
            setOpen(false);
        }
    }

  return (
   <>

   <AlertModal
       isOpen={open}
       onClose={() => setOpen(false)}
       onConfirm={() => {onDelete()}}
       loading={loading}
   />

     <div className='flex items-center justify-between' >
        <Heading 
            title={title}
            description={description}    
        />
        { initialData && 
            <Button 
              disabled={loading}
              variant="destructive"
              size="icon"
              onClick={() => {
              setOpen(true)
              
              }}
            >
              <Trash className="h-4 w-4"/>  
            </Button>}
      </div>

    <Separator/>
    <Form {...form}>
        <form 
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8 w-full"
            >
           
            <div className="grid grid-cols-3 gap-8">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                 {...field} 
                                disabled={loading}
                                placeholder="Category Name"/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="billboardId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Billboard</FormLabel>
                            <Select disabled={loading} 
                            onValueChange={field.onChange } 
                            value={field.value} defaultValue={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue 
                                        defaultValue={field.value}
                                        placeholder="Select a billboard" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {billboards.map((billboard) => (
                                        <SelectItem
                                        key={billboard.id}
                                        value={billboard.id}
                                        >
                                            {billboard.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>

                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <Button 
                disabled={loading}
                className="ml-auto"
                type="submit"
            >
                {action}
            </Button>
        </form>
    </Form>
    <Separator/>

   </>
  )
};