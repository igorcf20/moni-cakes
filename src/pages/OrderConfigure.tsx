import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";

type Address = {
  id: string;
  name: string;
  street: string;
  number: string | null;
  complement: string | null;
  parish: string | null;
  city: string;
  postal_code: string;
  district: string | null;
};

const OrderConfigure = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<Partial<Address>>({});

  const [deliveryMethods, setDeliveryMethods] = useState<any[]>([]);
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("");

  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");

  useEffect(() => {
    if (!user) {
      navigate(`/auth?redirect=/pedido/${orderId}/configurar`);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: o }, { data: addrs }, { data: dm }, { data: pm }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        (supabase as any).from("user_addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
        (supabase as any).from("delivery_methods").select("*").eq("is_active", true).order("display_order"),
        (supabase as any).rpc("get_active_payment_methods"),
      ]);
      if (cancelled) return;
      setOrder(o);
      setAddresses(addrs || []);
      if ((addrs || []).length > 0) setAddressId(addrs![0].id);
      setDeliveryMethods(dm || []);
      setPaymentMethods(pm || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, orderId, navigate]);

  const selectedDelivery = useMemo(
    () => deliveryMethods.find((d) => d.id === deliveryMethodId),
    [deliveryMethods, deliveryMethodId],
  );
  const shippingCost = useMemo(() => {
    const cfg = (selectedDelivery?.config || {}) as any;
    return Number(cfg.price ?? cfg.base_price ?? 0);
  }, [selectedDelivery]);

  const buildShippingAddress = (): any | null => {
    if (selectedDelivery?.type === "pickup") return null;
    if (useNewAddress) {
      if (!newAddress.street || !newAddress.city || !newAddress.postal_code) return null;
      return {
        name: newAddress.name || order?.guest_name,
        street: newAddress.street,
        number: newAddress.number || "",
        complement: newAddress.complement || "",
        parish: newAddress.parish || "",
        city: newAddress.city,
        postal_code: newAddress.postal_code,
        district: newAddress.district || "",
        country: "PT",
      };
    }
    const a = addresses.find((x) => x.id === addressId);
    if (!a) return null;
    return {
      name: a.name || order?.guest_name,
      street: a.street, number: a.number || "", complement: a.complement || "",
      parish: a.parish || "", city: a.city, postal_code: a.postal_code,
      district: a.district || "", country: "PT",
    };
  };

  const submit = async () => {
    if (!deliveryMethodId) return toast.error("Escolha o método de envio");
    if (selectedDelivery?.type !== "pickup") {
      const addr = buildShippingAddress();
      if (!addr) return toast.error("Selecione ou preencha uma morada");
    }
    if (!paymentMethodId) return toast.error("Escolha o método de pagamento");

    setSaving(true);
    try {
      const pm = paymentMethods.find((p) => p.id === paymentMethodId);
      const { data, error } = await supabase.functions.invoke("finalize-manual-order", {
        body: {
          order_id: orderId,
          delivery_method_id: deliveryMethodId,
          payment_method_id: paymentMethodId,
          payment_method_type: pm?.type,
          shipping_address: buildShippingAddress(),
          shipping_cost: shippingCost,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Pedido atualizado. Siga as instruções de pagamento.");
      navigate(`/pedido/${orderId}/sucesso`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar pedido");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Pedido não encontrado.</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!order.requires_customer_config) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center space-y-3">
          <p className="text-muted-foreground">Este pedido já tem envio e pagamento definidos.</p>
          <Button onClick={() => navigate(`/pedido/${orderId}/sucesso`)}>Ver pedido</Button>
        </div>
        <Footer />
      </div>
    );
  }

  const subtotalNet = Number(order.subtotal_net ?? 0);
  const vatTotal = Number(order.vat_total ?? 0);
  const total = subtotalNet + vatTotal + shippingCost;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Método de envio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={deliveryMethodId} onValueChange={setDeliveryMethodId}>
                  <SelectTrigger><SelectValue placeholder="Escolher método…" /></SelectTrigger>
                  <SelectContent>
                    {deliveryMethods.map((d) => {
                      const cfg = (d.config || {}) as any;
                      const price = Number(cfg.price ?? cfg.base_price ?? 0);
                      return (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} — {price > 0 ? formatPrice(price) : "Grátis"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {selectedDelivery?.type === "pickup" ? (
                  <p className="text-sm text-muted-foreground">Levantamento — não precisa de morada.</p>
                ) : deliveryMethodId ? (
                  <div className="space-y-2">
                    {addresses.length > 0 && !useNewAddress && (
                      <Select value={addressId} onValueChange={setAddressId}>
                        <SelectTrigger><SelectValue placeholder="Escolher morada…" /></SelectTrigger>
                        <SelectContent>
                          {addresses.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name || "Morada"} — {a.street}, {a.city} {a.postal_code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <button type="button" className="text-xs text-primary hover:underline"
                      onClick={() => setUseNewAddress((v) => !v)}>
                      {useNewAddress ? "Usar morada guardada" : "Inserir nova morada"}
                    </button>
                    {useNewAddress && (
                      <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 bg-muted/20">
                        <Input placeholder="Nome do destinatário" value={newAddress.name || ""} onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })} />
                        <Input placeholder="Telefone (opc.)" />
                        <Input className="col-span-2" placeholder="Rua" value={newAddress.street || ""} onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })} />
                        <Input placeholder="Nº" value={newAddress.number || ""} onChange={(e) => setNewAddress({ ...newAddress, number: e.target.value })} />
                        <Input placeholder="Complemento" value={newAddress.complement || ""} onChange={(e) => setNewAddress({ ...newAddress, complement: e.target.value })} />
                        <Input placeholder="Freguesia" value={newAddress.parish || ""} onChange={(e) => setNewAddress({ ...newAddress, parish: e.target.value })} />
                        <Input placeholder="Localidade" value={newAddress.city || ""} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} />
                        <Input placeholder="Código postal" value={newAddress.postal_code || ""} onChange={(e) => setNewAddress({ ...newAddress, postal_code: e.target.value })} />
                        <Input placeholder="Distrito" value={newAddress.district || ""} onChange={(e) => setNewAddress({ ...newAddress, district: e.target.value })} />
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Método de pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger><SelectValue placeholder="Escolher método…" /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Após confirmar, as instruções de pagamento serão mostradas no detalhe do pedido.
                </p>
              </CardContent>
            </Card>
          </div>

          <aside>
            <Card className="sticky top-20">
              <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(subtotalNet)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>IVA</span><span>{formatPrice(vatTotal)}</span></div>
                <div className="flex justify-between"><span>Envio</span><span>{formatPrice(shippingCost)}</span></div>
                <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>{formatPrice(total)}</span></div>
                <Button className="w-full mt-3" onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmar e pagar
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrderConfigure;