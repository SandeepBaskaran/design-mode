import * as z from "zod";

export interface ActionResponse<T = unknown> {
  success: boolean;
  message: string;
  errors?: {
    [K in keyof T]?: string[];
  };
  inputs?: T;
}
export const formSchema = z.object({
  name: z.string({ message: "This field is required" }),
  email: z.string({ message: "This field is required" }),
  company: z.string({ message: "This field is required" }).optional(),
  employees: z.string().min(1, "Please select an item").optional(),
  message: z.string({ message: "This field is required" }),
  agree: z.literal(true, { message: "This field is required" }),
});
