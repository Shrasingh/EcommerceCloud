"use client";
import axios from "axios";

import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Size } from "@prisma/client";
import { useForm } from "react-hook-form";
import { Settings } from "lucide-react";
import Heading from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react"; // an icon component that visually represents a trash can, typically used to indicate deletion functionality in a user interface.
import { Separator } from "@/components/ui/separator";
import * as z from "zod"; // imports all the exports from the zod library as the z namespace, which is used for schema validation and type-safe parsing in JavaScript and TypeScript applications
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { AlertModal } from "@/components/modals/alert-modal";

import { useOrigin } from "@/hooks/use-origin";
import ImageUpload from "@/components/ui/Image-upload";
const formSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

type SizeFormValues = z.infer<typeof formSchema>;
interface SizeFormProps {
  initialData: Size | null;
}
export const SizeForm: React.FC<SizeFormProps> = ({
  initialData,
}) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const title = initialData ? "Edit size" : "Create size";
  const description = initialData ? "Edit size" : "Add a new  size";
  const toastMessage = initialData ? "Size updated" : "Size created";
  const action = initialData ? "Save changes " : "Create ";
  const form = useForm<SizeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      value: "",
    },
  });
  const onSubmit = async (data:SizeFormValues) => {
    try {
      setLoading(true);
      if(initialData){
        await axios.patch(`/api/${params.storeId}/sizes/${params.sizeId}` ,data);
      }
      else{
        await axios.post(`/api/${params.storeId}/sizes`,data);
      }
      router.refresh();
      router.push(`/${params.storeId}/sizes
      `)
      toast.success(toastMessage);
    } catch (error) {
      toast.error("Something went wrong  ");
    } finally {
      setLoading(false);
    }
  };
  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/Sizes/${params.sizeId}`);
      router.refresh();
      router.push("/");
      toast.success("Size deleted.");
    } catch (error) {
      toast.error(
        " Make sure you removed all the products using  this size categories first. "
      );
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };
  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {onDelete()}}
        loading={loading}
      />
      <div className=" flex items-center justify-between">
        <Heading title={title} description={description} />
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="icon"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4  " />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input disabled={loading} placeholder="Size name" {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
            <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input disabled={loading} placeholder="Size value" {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-8">
          
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
      
    </>
  );
};

//Cloudinary is a cloud-based service for managing, optimizing, and delivering images and videos, commonly used to enhance website performance and user experience.
