"use client";
import axios from "axios";

import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Billboard } from "@prisma/client";
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
  label: z.string().min(1),
  imageUrl: z.string().min(1),
});

type BillboardFormValues = z.infer<typeof formSchema>;
interface BillboardFormProps {
  initialData: Billboard | null;
}
export const BillboardForm: React.FC<BillboardFormProps> = ({
  initialData,
}) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const title = initialData ? "Edit billboard" : "Create billboard";
  const description = initialData ? "Edit billboard" : "Add a new  billboard";
  const toastMessage = initialData ? "Billboard updated" : " billboard created";
  const action = initialData ? "Save changes " : "Create ";
  const form = useForm<BillboardFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      label: "",
      imageUrl: "",
    },
  });
  const onSubmit = async (data: BillboardFormValues) => {
    try {
      setLoading(true);
      if(initialData){
        await axios.patch(`/api/${params.storeId}/billboards/${params.billboardId}` ,data);
      }
      else{
        await axios.post(`/api/${params.storeId}/billboards`,data);
      }
      router.refresh();
      router.push(`/${params.storeId}/billboards
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
      await axios.delete(`/api/${params.storeId}/billboards/${params.billboardId}`);
      router.refresh();
      router.push("/");
      toast.success("Store deleted.");
    } catch (error) {
      toast.error(
        " Make sure you removed all the products and categories first. "
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
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Background image </FormLabel>
                <FormControl>
                  <ImageUpload
                  value={field.value ? [field.value ] : [] } 
                  disabled={loading} 
                  onChange={(url) => field.onChange(url)}
                  onRemove={() => field.onChange("")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Billboard label"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
