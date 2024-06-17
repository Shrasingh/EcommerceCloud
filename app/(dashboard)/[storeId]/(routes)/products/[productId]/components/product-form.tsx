"use client";
import axios from "axios";
import { Select ,SelectContent,SelectValue,SelectItem,SelectTrigger } from "@/components/ui/select"
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Product, Image, Category ,Color,Size} from "@prisma/client";
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
  FormControl,FormDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
const formSchema = z.object({
  name: z.string().min(1),
  images: z.object({ url: z.string({ message: "Image is required" }) }).array(),
  price: z.coerce.number(),
  categoryId: z.string().min(1),
  colorId: z.string().min(1),
  sizeId: z.string().min(1),
  isFeatured: z.boolean().default(false).optional(),
  isArchived: z.boolean().default(false).optional(),
});

type ProductFormValues = z.infer<typeof formSchema>;
interface ProductFormProps {
  initialData:
    | (Product & {
        images: Image[];
      })
    | null;
    categories: Category[];
    colors: Color[];
    sizes: Size[];
}
export const ProductForm: React.FC<ProductFormProps> = ({
   initialData,
  categories,
colors,
sizes }) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const title = initialData ? "Edit Product" : "Create product'";
  const description = initialData ? "Edit a product " : "Add a new  a product ";
  const toastMessage = initialData ? "product updated" : " product created";
  const action = initialData ? "Save changes " : "Create ";
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          price: parseFloat(String(initialData?.price)),
        }
      : {
          name: "",
          images: [],
          price: 0,
          categoryId: "",
          colorId: " ",
          sizeId: "",
          isFeatured: false,
          isArchived: false,
        },
  });
  const onSubmit = async (data: ProductFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/products/${params.productId}`,
          data
        );
      } else {
        await axios.post(`/api/${params.storeId}/products`, data);
      }
      router.refresh();
      router.push(`/${params.storeId}/products
      `);
      toast.success(toastMessage);
    } catch (error) {
      toast.error("Something went wrong  ");
    } finally {
      setLoading(false);
    }
  };
  const ondelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/products/${params.productId}`
      );
      router.refresh();
      router.push(`/${params.storeId}/products`);
      toast.success("Store deleted.");
    } catch (error) {
      toast.error(
        " Something went wrong. Please try again. "
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
        onConfirm={() => {}}
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
            name="images"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Images </FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value.map((image) => image.url)}
                    disabled={loading}
                    onChange={(url) =>
                      field.onChange([...field.value, { url }])
                    }
                    onRemove={(url) =>
                      field.onChange([
                        ...field.value.filter((current) => current.url !== url),
                      ])
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Product name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="9.99"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a category"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    { categories.map (( category ) => 
                      (
                        <SelectItem
                        key={category.id}
                        value={category.id}
                        >
{category.name}
                        </SelectItem>                     ))
                      }
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sizeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Size</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a size"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    { sizes.map (( size ) => 
                      (
                        <SelectItem
                        key={size.id}
                        value={size.id}
                        >
{size.name}
                        </SelectItem>                     ))
                      }
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="colorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a color"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    { colors.map (( color ) => 
                      (
                        <SelectItem
                        key={color.id}
                        value={color.id}
                        >
{color.name}
                        </SelectItem>                     ))
                      }
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />

<FormField
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                 <FormControl>
                  <Checkbox
                  checked = {field.value}
                  onCheckedChange={field.onChange}
                  //@ ts-ignore
                  />
                 </FormControl>
                 <div className="space-y-1 leading-none">
                  <FormLabel>
                    Featured
                  </FormLabel>
                  <FormDescription>
                    This product will appear on home page
                  </FormDescription>
                 </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isArchived"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-y-0 rounded-md border p-4">
                 <FormControl>
                  <Checkbox
                  checked = {field.value}
                  onCheckedChange={field.onChange}
                  //@ ts-ignore
                  />
                 </FormControl>
                 <div className="space-y-1 leading-none">
                  <FormLabel>
                    Archived
                  </FormLabel>
                  <FormDescription>
                    This product will not  appear anywhere in the store
                  </FormDescription>
                 </div>
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
