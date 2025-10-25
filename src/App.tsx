import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Settings } from "lucide-react"

function App() {

  const [notifications, setNotifications] = useState(true)
  const [updateDaily, setUpdateDaily] = useState(true)

  const items = [
    {
      icon: "🌐",
      name: "google.com",
      status: "Stetus: No changes",
      checked: true,
    },
    {
      icon: "📘",
      name: "facebook.com",
      status: "Status: Updated today",
      checked: true,
    },
    {
      icon: "📘",
      name: "facebook.com",
      status: "Swittter",
      checked: true,
    },
    {
      icon: "🐦",
      name: "twittored",
      status: "",
      checked: true,
    },
  ]

    {/* <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4"> */}
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-gray-100 p-4">
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="flex justify-between items-center pb-3 border-b">
          <CardTitle className="text-lg font-semibold">Main Popup UI</CardTitle>
          <Settings size={18} className="text-gray-500" />
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-white border rounded-lg px-3 py-2"
            >
              <div className="flex items-center space-x-3">
                <div className="text-xl">{item.icon}</div>
                <div className="flex flex-col leading-tight">
                  <span className="font-medium text-sm">{item.name}</span>
                  {item.status && (
                    <span className="text-xs text-gray-500">{item.status}</span>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "w-5 h-5 rounded-full border-2",
                  item.checked
                    ? "bg-green-500 border-green-500"
                    : "border-gray-300"
                )}
              />
            </div>
          ))}

          <div className="mt-5 space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Notifications:</Label>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Update Frequency:</Label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Daily</span>
                <Switch checked={updateDaily} onCheckedChange={setUpdateDaily} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Language Level:</Label>
              <button className="px-3 py-1 rounded-md border bg-gray-100 text-sm font-medium">
                Standard
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default App;
